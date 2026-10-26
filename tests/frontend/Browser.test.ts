import { expect, test } from "bun:test";
import { MongoClient } from "mongodb";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleApplication } from "../../src/assembly.ts";
import { createDiscoveryHandler } from "../../src/discovery.ts";
import { bearerAuthenticator, createApiHandler } from "../../src/server.ts";
import { createLiveHub, type LiveSocketData } from "../../src/live.ts";
import { createSharingHandler } from "../../src/sharing.ts";
import {
  proxySocketHandler,
  proxyWebSocket,
  type ProxySocketData,
} from "../../web/ws-proxy.ts";

// Opt-in because this exercises a locally installed Chrome as well as MongoDB.
const browserTest =
  process.env.ONDECK_BROWSER_TESTS === "1" ||
  Bun.argv.some((arg) => arg.endsWith("/Browser.test.ts"))
    ? test
    : test.skip;
browserTest(
  "desktop and mobile journey uses the actual app with two accounts and live sockets",
  async () => {
    const mongo = new MongoClient(
      process.env.MONGODB_TEST_URL || process.env.MONGODB_URL!,
      { serverSelectionTimeoutMS: 3000 },
    );
    await mongo.connect();
    const db = mongo.db(
      `ondeck_test_${crypto.randomUUID().replaceAll("-", "")}`,
    );
    const app = assembleApplication(db);
    const authenticate = bearerAuthenticator({ alice: "alice", bob: "bob", retry: "retry" });
    let origin = "";
    const origins: string[] = [];
    const hub = createLiveHub(authenticate, origins);
    const api = createApiHandler(app, authenticate, {
      changed: hub.changed,
    });
    let discoveryCalls = 0;
    let releaseDiscovery!: () => void;
    const discoveryGate = new Promise<void>(resolve => { releaseDiscovery = resolve; });
    const discovery = createDiscoveryHandler(app, authenticate, async (_prompt, candidates) => {
      discoveryCalls++;
      await discoveryGate;
      return { ranking: candidates.map(row => ({ activity: row.activity, reason: "Could suit a relaxed mood." })) };
    });
    const inFlight = new Set<Promise<Response>>();
    let rejectNextOrder = false;
    let sharesUntilFailure = 0;
    let confirmations = 0;
    const trackedApi = (request: Request) => {
      const path = new URL(request.url).pathname;
      if (path === "/api/captures/confirm") confirmations++;
      if (path === "/api/activities/add-to-group" && sharesUntilFailure > 0 && --sharesUntilFailure === 0)
        return Promise.resolve(Response.json({ error: "UNAVAILABLE" }, { status: 503 }));
      if (
        new URL(request.url).pathname === "/api/groups/order" &&
        rejectNextOrder
      ) {
        rejectNextOrder = false;
        return Promise.resolve(
          Response.json({ error: "UNAVAILABLE" }, { status: 503 }),
        );
      }
      const promise = api(request);
      inFlight.add(promise);
      promise.then(
        () => inFlight.delete(promise),
        () => inFlight.delete(promise),
      );
      return promise;
    };
    const activeSockets = new Set<Bun.ServerWebSocket<LiveSocketData>>();
    const backend = Bun.serve<LiveSocketData>({
      port: 0,
      hostname: "127.0.0.1",
      websocket: {
        ...hub.websocket,
        open(socket) {
          activeSockets.add(socket);
          hub.websocket.open(socket);
        },
        close(socket) {
          activeSockets.delete(socket);
          hub.websocket.close(socket);
        },
      },
      fetch: (request) => new Response("Not found", { status: 404 }),
      routes: {
        "/api/*": trackedApi,
        "/discovery/options": discovery,
        "/live/ticket": hub.ticket,
        "/live": (request: Request, server: Bun.Server<LiveSocketData>) =>
          hub.upgrade(request, server),
      },
    });
    const build = await Bun.build({
      entrypoints: [new URL("../../web/app.ts", import.meta.url).pathname],
      target: "browser",
      plugins: [
        {
          name: "test-auth",
          setup(builder) {
            builder.onLoad({ filter: /\/useAuth\.ts$/ }, () => ({
              loader: "ts",
              contents: `
      import { ref, onMounted } from 'vue/dist/vue.esm-browser.js';
      export function useAuth(changed) {
        const user = ref(''), accountName = ref(''), authReady = ref(false), authError = ref('');
        onMounted(() => { user.value = new URLSearchParams(location.search).get('account') || 'alice'; accountName.value = user.value === 'alice' ? 'Alice' : 'Bob'; authReady.value = true; changed(); });
        return { user, accountName, authReady, authError, getToken: async () => user.value, signIn() {}, signUp() {}, editProfile() {}, signOut: async () => { user.value = ''; changed(); } };
      }`,
            }));
          },
        },
      ],
    });
    if (!build.success) throw new Error(build.logs.join("\n"));
    const javascript = await build.outputs[0]!.text();
    const html = (
      await Bun.file(new URL("../../web/index.html", import.meta.url)).text()
    ).replace('src="./app.ts"', 'src="/app.js"');
    const frontend = Bun.serve<ProxySocketData>({
      port: 0,
      hostname: "127.0.0.1",
      websocket: proxySocketHandler,
      fetch: async (request, server) => {
        const path = new URL(request.url).pathname;
        if (path === "/")
          return new Response(html, {
            headers: { "Content-Type": "text/html" },
          });
        if (path === "/app.js")
          return new Response(javascript, {
            headers: { "Content-Type": "application/javascript" },
          });
        if (path === "/styles.css")
          return new Response(
            Bun.file(new URL("../../web/styles.css", import.meta.url)),
          );
        if (path === "/auth/people")
          return Response.json({ names: { alice: "Alice", bob: "Bob" } });
        if (path === "/live")
          return proxyWebSocket(request, server, backend.url.href);
        if (path.startsWith("/sharing/"))
          return createSharingHandler(authenticate, app.concepts.MembershipTracking)(request);
        return fetch(new URL(path, backend.url), request);
      },
    });
    origin = frontend.url.origin;
    origins.push(origin);
    const profile = await mkdtemp(join(tmpdir(), "ondeck-browser-"));
    const chrome = Bun.spawn(
      [
        process.env.CHROME_PATH ??
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "--headless",
        "--disable-gpu",
        "--disable-background-timer-throttling",
        "--disable-renderer-backgrounding",
        "--no-first-run",
        "--no-default-browser-check",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        "about:blank",
      ],
      { stdout: "ignore", stderr: "pipe" },
    );
    const pages: Array<{ socket: WebSocket }> = [];
    try {
      const reader = chrome.stderr.getReader();
      let log = "",
        debugging = "";
      while (!debugging) {
        const result = await reader.read();
        if (result.done) throw new Error(`Chrome did not start: ${log}`);
        log += new TextDecoder().decode(result.value);
        debugging =
          log.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? "";
      }
      reader.releaseLock();
      const debugURL = new URL(debugging);
      debugURL.protocol = "http:";
      async function page(account: string) {
        const target = (await (
          await fetch(new URL("/json/new?about:blank", debugURL), {
            method: "PUT",
          })
        ).json()) as { webSocketDebuggerUrl: string };
        const socket = new WebSocket(target.webSocketDebuggerUrl);
        pages.push({ socket });
        await new Promise<void>((resolve, reject) => {
          socket.onopen = () => resolve();
          socket.onerror = reject;
        });
        let id = 0;
        const pending = new Map<
          number,
          { resolve: (result: any) => void; reject: (error: unknown) => void }
        >();
        const errors: string[] = [];
        socket.onmessage = (event) => {
          const value = JSON.parse(String(event.data));
          if (value.method === "Page.javascriptDialogOpening") {
            errors.push("Unexpected browser dialog");
            void command("Page.handleJavaScriptDialog", { accept: false });
          }
          if (value.method === "Runtime.exceptionThrown")
            errors.push(JSON.stringify(value.params));
          if (value.id) {
            const request = pending.get(value.id);
            pending.delete(value.id);
            if (value.error) request?.reject(value.error);
            else request?.resolve(value.result);
          }
        };
        function command(method: string, params: unknown = {}): Promise<any> {
          return new Promise((resolve, reject) => {
            const key = ++id;
            const timeout = setTimeout(() => {
              pending.delete(key);
              reject(new Error(`CDP timed out: ${method}`));
            }, 8000);
            pending.set(key, {
              resolve: (result) => {
                clearTimeout(timeout);
                resolve(result);
              },
              reject: (error) => {
                clearTimeout(timeout);
                reject(error);
              },
            });
            socket.send(JSON.stringify({ id: key, method, params }));
          });
        }
        await command("Runtime.enable");
        await command("Page.enable");
        const evaluate = async (expression: string) => {
          await command("Page.bringToFront");
          const result = await command("Runtime.evaluate", {
            expression,
            returnByValue: true,
            awaitPromise: true,
            userGesture: true,
          });
          if (result.exceptionDetails)
            throw new Error(JSON.stringify(result.exceptionDetails));
          return result.result.value;
        };
        await command("Emulation.setDeviceMetricsOverride", {
          width: 1280,
          height: 900,
          deviceScaleFactor: 1,
          mobile: false,
        });
        await command("Page.navigate", {
          url: `${origin}/?account=${account}`,
        });
        async function until(expression: string) {
          await evaluate(
            `new Promise((resolve,reject) => { const started=Date.now(); const tick=()=>{ if (${expression}) return resolve(true); if(Date.now()-started>5000) return reject(new Error('UI condition timed out: '+${JSON.stringify(expression)})); setTimeout(tick,50); }; tick(); })`,
          );
        }
        const buttonText = `(b)=>{const c=b.cloneNode(true);c.querySelectorAll('[aria-hidden=true]').forEach(n=>n.remove());return c.textContent.trim()}`;
        const click = async (text: string) => {
          await until(
            `([...document.querySelectorAll('button')].some(b=>(${buttonText})(b)===${JSON.stringify(text)} && !b.matches(':disabled')))`,
          );
          return evaluate(
            `(() => { const b=[...document.querySelectorAll('button')].find(b=>(${buttonText})(b)===${JSON.stringify(text)}); if(!b) throw new Error('No button: '+${JSON.stringify(text)}); b.click(); })()`,
          );
        };
        const input = async (selector: string, value: string) => {
          await until(
            `!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector(${JSON.stringify(selector)}).matches(':disabled')`,
          );
          return evaluate(
            `(() => { const e=document.querySelector(${JSON.stringify(selector)}); e.value=${JSON.stringify(value)}; e.dispatchEvent(new Event('input',{bubbles:true})); })()`,
          );
        };
        await until(
          "document.querySelector('h1')?.textContent === 'Groups' && !document.querySelector('[role=alert]') && !document.querySelector('fieldset').disabled",
        );
        async function upload(selector: string, file: string) {
          await until(`!!document.querySelector(${JSON.stringify(selector)})`);
          const { root } = await command("DOM.getDocument");
          const { nodeId } = await command("DOM.querySelector", {
            nodeId: root.nodeId,
            selector,
          });
          await command("DOM.setFileInputFiles", { nodeId, files: [file] });
        }
        async function dragCards(from: number, to: number, touch = false) {
          const position = await evaluate(
            `(() => { const cards=document.querySelectorAll('.group-grid > .group-card'), handle=cards[${from}].querySelector('.drag-handle').getBoundingClientRect(), target=cards[${to}].getBoundingClientRect(); return { id:cards[${from}].dataset.groupId, from:{x:handle.left+handle.width/2,y:handle.top+handle.height/2},to:{x:target.left+target.width/2,y:target.top+target.height/2} }; })()`,
          );
          const point = (x: number, y: number) => ({
            x,
            y,
            id: 0,
            radiusX: 2,
            radiusY: 2,
            force: 1,
          });
          if (touch)
            await command("Input.dispatchTouchEvent", {
              type: "touchStart",
              touchPoints: [point(position.from.x, position.from.y)],
            });
          else {
            await command("Input.dispatchMouseEvent", {
              type: "mouseMoved",
              ...position.from,
            });
            await until(
              `Number(getComputedStyle(document.querySelectorAll('.group-grid .drag-handle')[${from}]).opacity) > .99`,
            );
            await command("Input.dispatchMouseEvent", {
              type: "mousePressed",
              button: "left",
              buttons: 1,
              clickCount: 1,
              ...position.from,
            });
          }
          for (let step = 1; step <= 12; step++) {
            const x =
                position.from.x +
                ((position.to.x - position.from.x) * step) / 12,
              y =
                position.from.y +
                ((position.to.y - position.from.y) * step) / 12;
            if (touch)
              await command("Input.dispatchTouchEvent", {
                type: "touchMove",
                touchPoints: [point(x, y)],
              });
            else
              await command("Input.dispatchMouseEvent", {
                type: "mouseMoved",
                buttons: 1,
                x,
                y,
              });
            await evaluate("new Promise(resolve=>setTimeout(resolve,35))");
          }
          await until(
            `document.querySelectorAll('.group-grid > .group-card')[${to}]?.dataset.groupId === ${JSON.stringify(position.id)} && !!document.querySelector('.group-sort-preview')`,
          );
          if (touch)
            await command("Input.dispatchTouchEvent", {
              type: "touchEnd",
              touchPoints: [],
            });
          else
            await command("Input.dispatchMouseEvent", {
              type: "mouseReleased",
              button: "left",
              buttons: 0,
              clickCount: 1,
              ...position.to,
            });
        }
        return {
          command,
          evaluate,
          until,
          click,
          input,
          upload,
          dragCards,
          errors,
        };
      }
      console.info("Browser: create group");
      const alice = await page("alice");
      const pictureFile = join(profile, "group-picture.png");
      const picture = await alice.evaluate(
        `(() => { const canvas=document.createElement('canvas');canvas.width=320;canvas.height=160;const context=canvas.getContext('2d');const gradient=context.createLinearGradient(0,0,320,160);gradient.addColorStop(0,'#9bb5a3');gradient.addColorStop(1,'#e0b18b');context.fillStyle=gradient;context.fillRect(0,0,320,160);return canvas.toDataURL('image/png').split(',')[1]; })()`,
      );
      await Bun.write(pictureFile, Buffer.from(picture, "base64"));
      await alice.click("＋ New group");
      await alice.input('input[placeholder="Roommates"]', "Roommates");
      await alice.upload("#group-picture", pictureFile);
      await alice.until(
        "document.querySelector('.picture-editor').open && !document.querySelector('.picture-editor .primary').disabled",
      );
      await alice.click("Apply crop");
      await alice.until(
        "document.querySelector('.group-picture-preview img')?.naturalWidth > 0 && !document.querySelector('.group-form .primary').disabled",
      );
      if (process.env.ONDECK_SCREENSHOT) {
        const result = await alice.command("Page.captureScreenshot", {
          format: "png",
        });
        await Bun.write(
          process.env.ONDECK_SCREENSHOT.replace(/\.png$/, "-group-form.png"),
          Buffer.from(result.data, "base64"),
        );
      }
      expect(
        await alice.evaluate(
          "document.querySelector('.group-picture-preview').getBoundingClientRect().height > 300",
        ),
      ).toBe(true);
      expect(
        await alice.evaluate(
          "getComputedStyle(document.querySelector('.group-picture-preview img')).objectFit",
        ),
      ).toBe("contain");
      const beforeCrop = await alice.evaluate(
        "document.querySelector('.group-picture-preview img').src",
      );
      await alice.click("Edit picture");
      await alice.until(
        "document.querySelector('.picture-editor').open && !document.querySelector('.picture-editor .primary').disabled",
      );
      const initialCrop = await alice.evaluate(
        "document.querySelector('.picture-editor canvas').toDataURL()",
      );
      await alice.input('.picture-editor input[aria-label="Zoom"]', "2");
      const cropPoint = await alice.evaluate(
        "(() => { const r=document.querySelector('.picture-editor canvas').getBoundingClientRect(); return { x:r.left+r.width/2,y:r.top+r.height/2 }; })()",
      );
      await alice.command("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...cropPoint,
      });
      await alice.command("Input.dispatchMouseEvent", {
        type: "mousePressed",
        button: "left",
        buttons: 1,
        clickCount: 1,
        ...cropPoint,
      });
      await alice.command("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        buttons: 1,
        x: cropPoint.x + 40,
        y: cropPoint.y + 10,
      });
      await alice.command("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        button: "left",
        buttons: 0,
        clickCount: 1,
        x: cropPoint.x + 40,
        y: cropPoint.y + 10,
      });
      expect(
        Number(
          await alice.evaluate(
            "document.querySelector('.picture-editor input[aria-label=\"Horizontal position\"]').value",
          ),
        ),
      ).toBeLessThan(50);
      await alice.input(
        '.picture-editor input[aria-label="Horizontal position"]',
        "80",
      );
      await alice.click("Rotate");
      expect(
        await alice.evaluate(
          "document.querySelector('.picture-editor canvas').toDataURL()",
        ),
      ).not.toBe(initialCrop);
      await alice.click("Reset");
      expect(
        await alice.evaluate(
          "document.querySelector('.picture-editor canvas').toDataURL()",
        ),
      ).toBe(initialCrop);
      await alice.input('.picture-editor input[aria-label="Zoom"]', "1.8");
      if (process.env.ONDECK_SCREENSHOT) {
        const result = await alice.command("Page.captureScreenshot", {
          format: "png",
        });
        await Bun.write(
          process.env.ONDECK_SCREENSHOT.replace(/\.png$/, "-crop.png"),
          Buffer.from(result.data, "base64"),
        );
      }
      await alice.command("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await alice.command("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await alice.until("!document.querySelector('.picture-editor').open");
      expect(
        await alice.evaluate(
          "document.querySelector('.group-picture-preview img').src",
        ),
      ).toBe(beforeCrop);
      await alice.click("Edit picture");
      await alice.until(
        "!document.querySelector('.picture-editor .primary').disabled",
      );
      await alice.input('.picture-editor input[aria-label="Zoom"]', "2");
      await alice.click("Apply crop");
      expect(
        await alice.evaluate(
          "document.querySelector('.group-picture-preview img').src",
        ),
      ).not.toBe(beforeCrop);
      await alice.click("Create");
      await alice.until(
        "document.querySelector('.group-card h3')?.textContent === 'Roommates' && !document.querySelector('fieldset').disabled",
      );
      expect(
        await alice.evaluate(
          "(() => { const grid=document.querySelector('.group-grid').getBoundingClientRect(), sidebar=document.querySelector('.sidebar').getBoundingClientRect(), content=document.querySelector('.workspace').getBoundingClientRect(); return grid.top > 0 && grid.top < 200 && sidebar.width <= 240 && content.left >= sidebar.right; })()",
        ),
      ).toBe(true);
      expect(
        await alice.evaluate(
          "document.querySelector('.group-cover img')?.src.startsWith('data:image/jpeg')",
        ),
      ).toBe(true);
      await alice.evaluate("document.querySelector('.card-edit').click()");
      await alice.until(
        "document.querySelector('.group-picture-preview img')?.naturalWidth > 0 && !document.querySelector('fieldset').disabled",
      );
      await alice.click("Delete picture");
      await alice.evaluate(
        "document.querySelector('.confirm-dialog .danger-button').click()",
      );
      await alice.click("Save changes");
      await alice.until(
        "!!document.querySelector('.group-card') && !document.querySelector('.group-cover img') && !document.querySelector('fieldset').disabled",
      );
      await alice.evaluate("document.querySelector('.card-edit').click()");
      await alice.upload("#group-picture", pictureFile);
      await alice.until(
        "document.querySelector('.picture-editor').open && !document.querySelector('.picture-editor .primary').disabled",
      );
      await alice.click("Apply crop");
      await alice.until(
        "document.querySelector('.group-picture-preview img')?.naturalWidth > 0 && !document.querySelector('.group-form .primary').disabled",
      );
      await alice.click("Save changes");
      await alice.until(
        "document.querySelector('.group-cover img')?.naturalWidth > 0 && !document.querySelector('fieldset').disabled",
      );
      await alice.command("Page.reload");
      await alice.until(
        "document.querySelector('.group-cover img')?.naturalWidth > 0 && !document.querySelector('fieldset').disabled",
      );
      const handlePosition = await alice.evaluate(
        `(() => { const card=document.querySelector('.group-card').getBoundingClientRect(), handle=document.querySelector('.drag-handle').getBoundingClientRect(); return { center:card.left+card.width/2, top:card.top, handleCenter:handle.left+handle.width/2, handleTop:handle.top }; })()`,
      );
      expect(
        Math.abs(handlePosition.center - handlePosition.handleCenter),
      ).toBeLessThan(1);
      expect(handlePosition.handleTop - handlePosition.top).toBeLessThan(12);
      await alice.command("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: handlePosition.center,
        y: handlePosition.top + 40,
      });
      await alice.until(
        "Number(getComputedStyle(document.querySelector('.drag-handle')).opacity) > .99",
      );
      await alice.command("Input.dispatchMouseEvent", {
        type: "mouseMoved",
        x: 0,
        y: 0,
      });
      await alice.until(
        "getComputedStyle(document.querySelector('.drag-handle')).opacity === '0'",
      );
      await alice.click("Members");
      await alice.until(
        "document.querySelector('.group-management') && document.querySelectorAll('.member-list li').length === 1",
      );
      await alice.command("Browser.grantPermissions", {
        origin,
        permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
      });
      await alice.click("Create and copy link");
      await alice.until(
        "document.querySelector('.success-toast')?.textContent.includes('Link copied.')",
      );
      expect(
        await alice.evaluate("!document.querySelector('.invite-link-field')"),
      ).toBe(true);
      expect(await alice.evaluate("document.querySelector('.invite-list strong').textContent")).toBe("Invite link 1");
      expect(await alice.evaluate("document.querySelector('.invite-list li').textContent.includes('Expires') && document.querySelector('.invite-list li').textContent.includes('Just copied')")).toBe(true);
      await alice.click("Copy link again");
      await alice.until("!document.querySelector('fieldset').disabled");
      expect(await alice.evaluate("document.querySelectorAll('.invite-list li').length")).toBe(1);
      const originalInvite = await alice.evaluate("navigator.clipboard.readText()");
      await alice.evaluate("document.querySelector('.invite-list li button[aria-label^=Rename]').click()");
      await alice.until("document.activeElement.id==='invite-link-name'");
      await alice.input('#invite-link-name', "Friends from work");
      await alice.click("Save name");
      await alice.until("document.querySelector('.invite-list strong')?.textContent==='Friends from work' && !document.querySelector('fieldset').disabled");
      await alice.click("Copy link again");
      await alice.until("!document.querySelector('fieldset').disabled");
      expect(await alice.evaluate("navigator.clipboard.readText()")).toBe(originalInvite);
      const extraID = (await alice.evaluate("document.querySelector('.invite-list li').dataset.link") as string).slice(-8);
      await alice.click("Create new link");
      await alice.until("document.querySelectorAll('.invite-list li').length===2 && !document.querySelector('fieldset').disabled");
      expect(await alice.evaluate("navigator.clipboard.readText()")).not.toBe(originalInvite);
      await alice.evaluate(`[...document.querySelectorAll('.invite-list li')].find(row=>row.textContent.includes(${JSON.stringify(extraID)})).querySelector('.danger-text').click()`);
      await alice.until("document.querySelector('.confirm-dialog').open");
      await alice.click("Revoke invitation");
      await alice.until("document.querySelectorAll('.invite-list li').length===1 && !document.querySelector('fieldset').disabled");
      expect(await alice.evaluate("document.querySelector('.invite-panel .primary').textContent==='Copy link again'")).toBe(true);
      const invite = (await alice.evaluate(
        "navigator.clipboard.readText()",
      )) as string;
      expect(invite).toContain("#invite=");
      console.info("Browser: join invitation");
      const bob = await page("bob");
      await bob.click("On Deck");
      await bob.command("Page.navigate", {
        url: invite.replace("/#", "/?account=bob#"),
      });
      await bob.until(
        "document.querySelector('.invite-preview button')?.disabled === false",
      );
      await bob.click("Accept");
      await bob.until(
        "document.querySelector('h1')?.textContent === 'On Deck' && !document.querySelector('fieldset').disabled",
      );
      expect(
        await bob.evaluate(
          "!document.querySelector('.invite-preview') && !document.querySelector('.invite-panel') && !document.querySelector('.invitations')",
        ),
      ).toBe(true);
      await alice.until(
        "document.querySelectorAll('.member-list li').length === 2",
      );
      expect(
        await alice.evaluate(
          "document.querySelector('.member-list').textContent.includes('Bob')",
        ),
      ).toBe(true);
      expect(
        await alice.evaluate(
          "document.querySelector('nav [aria-current=page]').textContent.includes('Groups')",
        ),
      ).toBe(true);
      if (process.env.ONDECK_SCREENSHOT) {
        const result = await alice.command("Page.captureScreenshot", {
          format: "png",
        });
        await Bun.write(
          process.env.ONDECK_SCREENSHOT.replace(/\.png$/, "-members.png"),
          Buffer.from(result.data, "base64"),
        );
      }
      await alice.click("Pick for Now");
      await alice.until(
        "document.querySelectorAll('.person-choice').length === 2 && !document.querySelector('fieldset').disabled",
      );
      expect(
        await alice.evaluate("document.querySelector('.pick-filters').open"),
      ).toBe(false);
      const selectedPeople = await alice.evaluate(
        "document.querySelectorAll('.person-choice input:checked').length",
      );
      await alice.evaluate(
        "document.querySelector('.pick-filters summary').click()",
      );
      expect(
        await alice.evaluate("document.querySelector('.pick-filters').open"),
      ).toBe(true);
      expect(
        await alice.evaluate(
          "document.querySelectorAll('.person-choice input:checked').length",
        ),
      ).toBe(selectedPeople);
      if (process.env.ONDECK_SCREENSHOT) {
        const result = await alice.command("Page.captureScreenshot", {
          format: "png",
        });
        await Bun.write(
          process.env.ONDECK_SCREENSHOT.replace(/\.png$/, "-pick-form.png"),
          Buffer.from(result.data, "base64"),
        );
      }
      console.info("Browser: add activity");
      await alice.click("Add activity");
      expect(
        await alice.evaluate(
          "(() => { const form=document.querySelector('.activity-form').getBoundingClientRect(), workspace=document.querySelector('.workspace'), rect=workspace.getBoundingClientRect(), style=getComputedStyle(workspace); return Math.abs(form.width-(rect.width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)))<1; })()",
        ),
      ).toBe(true);
      await alice.input('input[placeholder="Coffee"]', "Coffee tomorrow");
      expect(
        await alice.evaluate(
          "!document.querySelector('.add-page details') && document.querySelector('.add-page textarea').getBoundingClientRect().height > 0",
        ),
      ).toBe(true);
      await alice.click("Save and share");
      await alice.until(
        "document.querySelector('.activity-grid h3')?.textContent === 'Coffee tomorrow'",
      );
      await bob.until(
        "document.querySelector('.activity-grid h3')?.textContent === 'Coffee tomorrow'",
      );
      await bob.click("♡ Want to do");
      await alice.until(
        "document.querySelector('.activity-footer')?.textContent.includes('Alice, Bob')",
      );
      // Drop a real connection and change data while it is disconnected. The production
      // connection controller must reconnect and recover it without a page reload.
      for (const socket of activeSockets)
        if (socket.data.user === "alice") socket.close(1012, "Test reconnect");
      await alice.click("Add activity");
      await alice.input('input[placeholder="Coffee"]', "Keep my draft");
      await bob.click("Coffee tomorrow");
      await bob.until(
        "!!document.querySelector('.detail') && !document.querySelector('fieldset').disabled",
      );
      expect(
        await bob.evaluate(
          "!document.querySelector('.activity-grid') && document.activeElement.id==='activity-detail-title'",
        ),
      ).toBe(true);
      expect(
        await bob.evaluate(
          "document.querySelectorAll('.activity-member-list li').length",
        ),
      ).toBe(2);
      expect(
        await bob.evaluate(
          "!document.querySelector('.activity-detail-danger')",
        ),
      ).toBe(true);
      expect(await bob.evaluate("!!document.querySelector('.activity-empty-details') && !document.querySelector('.activity-facts')")).toBe(true);
      await bob.click("Edit activity");
      expect(await bob.evaluate("!!document.querySelector('#activity-edit-title') && document.activeElement.id==='activity-edit-name' && !document.querySelector('.interest-panel') && !document.querySelector('.activity-information') && !document.querySelector('.activity-group-interest')")).toBe(true);
      if (process.env.ONDECK_SCREENSHOT) {
        const shot = await bob.command("Page.captureScreenshot", { format: "png" });
        await Bun.write(process.env.ONDECK_SCREENSHOT.replace(/\.png$/, "-activity-edit.png"), Buffer.from(shot.data, "base64"));
      }
      await bob.input('.activity-details textarea', "Discard this draft");
      await bob.click("Cancel");
      await bob.until("!!document.querySelector('.interest-panel') && !document.querySelector('.activity-edit-form')");
      expect(await bob.evaluate("document.querySelector('.activity-description')?.textContent !== 'Discard this draft'")).toBe(true);
      await bob.click("Edit activity");
      await bob.input('.activity-details textarea', "Updated by another member");
      expect(await bob.evaluate("document.querySelector('.activity-edit-form input[type=\"datetime-local\"]').step==='1' && document.querySelector('#activity-edit-timezone').textContent.includes(Intl.DateTimeFormat().resolvedOptions().timeZone)")).toBe(true);
      await bob.input('.activity-edit-form input[type="datetime-local"]', "2026-11-05T18:45:30");
      await bob.click("Save changes");
      await bob.until("!document.querySelector('.activity-details form') && document.querySelector('.activity-description')?.textContent==='Updated by another member'");
      expect(await bob.evaluate("document.querySelector('.suggested-by')?.textContent.includes('Alice')")).toBe(true);
      await bob.until("document.querySelector('.success-toast')?.textContent.includes('Activity updated.')");
      expect(await bob.evaluate("!document.querySelector('.notices')?.textContent.includes('Activity updated.') && getComputedStyle(document.querySelector('.toast-region')).position==='fixed'")).toBe(true);
      await bob.until("!document.querySelector('.success-toast')");
      const [{ group: editedGroup }] = await app.concepts.MembershipTracking._groups({ user: "bob" });
      const [{ item: editedItem }] = await app.concepts.Suggesting._forGroup({ group: editedGroup! });
      const [beforeDate] = await app.concepts.ActivityCapturing._get({ activity: editedItem! });
      expect(beforeDate?.dateTime).toBe(await bob.evaluate("new Date('2026-11-05T18:45:30').toISOString()"));
      await bob.click("Edit activity");
      await bob.until("!!document.querySelector('.activity-edit-form')");
      await bob.click("Save changes");
      await bob.until("!document.querySelector('.activity-edit-form') && !document.querySelector('fieldset').disabled");
      const [afterDate] = await app.concepts.ActivityCapturing._get({ activity: editedItem! });
      expect(afterDate?.dateTime).toBe(beforeDate?.dateTime);
      if (process.env.ONDECK_SCREENSHOT) {
        const result = await bob.command("Page.captureScreenshot", {
          format: "png",
        });
        await Bun.write(
          process.env.ONDECK_SCREENSHOT.replace(
            /\.png$/,
            "-activity-details.png",
          ),
          Buffer.from(result.data, "base64"),
        );
      }
      await bob.click("I've done this");
      await bob.until(
        "!!document.querySelector('.completion-status') && !document.querySelector('fieldset').disabled",
      );
      expect(
        await bob.evaluate(
          "!!document.querySelector('.detail') && !document.querySelector('.activity-grid')",
        ),
      ).toBe(true);
      await bob.click("← Back to Roommates");
      await bob.until(
        "!!document.querySelector('.activity-grid') && !document.querySelector('.detail')",
      );
      expect(await bob.evaluate("document.activeElement.textContent")).toBe(
        "Coffee tomorrow",
      );
      expect(
        await bob.evaluate("!document.querySelector('.activity-delete')"),
      ).toBe(true);
      await bob.click("Pick for Now");
      await bob.input('textarea[placeholder="We want to do something chill"]', "Something chill");
      await bob.click("Find options →");
      await bob.until("document.querySelector('.discovery-loading')?.textContent.includes('Gemini is finding ideas')");
      expect(await bob.evaluate("document.querySelector('.pick-form').getAttribute('aria-busy')==='true' && document.querySelector('.pick-form .primary').disabled && document.querySelector('.pick-form .primary').textContent.includes('Finding ideas')")).toBe(true);
      expect(releaseDiscovery).toBeDefined();
      releaseDiscovery!();
      await bob.until("!document.querySelector('.discovery-loading') && document.querySelector('main')?.textContent.includes('Could suit a relaxed mood.') && !document.querySelector('fieldset').disabled");
      expect(discoveryCalls).toBe(1);
      expect(await bob.evaluate("!!document.querySelector('.pick-result-card .pick-result-reason') && !!document.querySelector('.pick-result-interest')")).toBe(true);
      await bob.evaluate("document.querySelector('.pick-result-card').scrollIntoView({block:'center'})");
      if (process.env.ONDECK_SCREENSHOT) {
        const shot = await bob.command("Page.captureScreenshot", { format: "png" });
        await Bun.write(process.env.ONDECK_SCREENSHOT.replace(/\.png$/, "-discovery-results.png"), Buffer.from(shot.data, "base64"));
      }
      await bob.command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
      await bob.evaluate("document.querySelector('.pick-result-card').scrollIntoView({block:'center'})");
      expect(await bob.evaluate("document.documentElement.scrollWidth <= window.innerWidth && getComputedStyle(document.querySelector('.pick-results')).gridTemplateColumns.split(' ').length===1")).toBe(true);
      if (process.env.ONDECK_SCREENSHOT) {
        const shot = await bob.command("Page.captureScreenshot", { format: "png" });
        await Bun.write(process.env.ONDECK_SCREENSHOT.replace(/\.png$/, "-discovery-mobile.png"), Buffer.from(shot.data, "base64"));
      }
      await bob.evaluate("window.dispatchEvent(new Event('focus'))");
      await alice.click("On Deck");
      await alice.until(
        "document.querySelector('.activity-footer')?.textContent.includes('1 have been')",
      );
      await alice.click("Add activity");
      expect(
        await alice.evaluate("document.querySelector('.add-page input').value"),
      ).toBe("Keep my draft");
      console.info("Browser: reorder and mobile layout");
      await alice.click("Groups");
      await alice.click("＋ New group");
      await alice.input('input[placeholder="Roommates"]', "Book club");
      await alice.click("Create");
      await alice.until(
        "document.querySelectorAll('.group-card').length === 2 && !document.querySelector('fieldset').disabled",
      );
      await alice.click("On Deck");
      await alice.until(
        "!!document.querySelector('.group-picker-trigger') && !document.querySelector('fieldset').disabled",
      );
      await alice.evaluate(
        "document.querySelector('.group-picker-trigger').click()",
      );
      await alice.until(
        "document.querySelector('[role=menuitemradio][aria-checked=true]') === document.activeElement",
      );
      expect(
        await alice.evaluate(
          "document.querySelectorAll('.group-picker-menu button').length",
        ),
      ).toBe(2);
      if (process.env.ONDECK_SCREENSHOT) {
        const result = await alice.command("Page.captureScreenshot", {
          format: "png",
        });
        await Bun.write(
          process.env.ONDECK_SCREENSHOT.replace(/\.png$/, "-group-picker.png"),
          Buffer.from(result.data, "base64"),
        );
      }
      await alice.command("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await alice.until(
        "!document.querySelector('.group-picker-menu') && document.activeElement.matches('.group-picker-trigger')",
      );
      await alice.evaluate(
        "document.querySelector('.group-picker-trigger').click()",
      );
      await alice.until("!!document.querySelector('.group-picker-menu')");
      await alice.evaluate(
        "[...document.querySelectorAll('.group-picker-menu button')].find(b=>b.textContent.includes('Roommates')).click()",
      );
      await alice.until(
        "document.querySelector('.group-picker-trigger').textContent.includes('Roommates') && !document.querySelector('fieldset').disabled && !!document.querySelector('.activity-grid h3')",
      );
      await alice.click("Groups");
      await alice.command("Page.reload");
      await alice.until(
        "document.querySelectorAll('.group-card').length === 2 && !document.querySelector('fieldset').disabled",
      );
      await alice.evaluate(
        "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
      );
      await alice.dragCards(1, 0);
      await alice.until(
        "document.querySelector('.group-grid > .group-card h3')?.textContent === 'Roommates' && document.querySelector('.group-order-status')?.textContent === 'Group order saved.'",
      );
      rejectNextOrder = true;
      await alice.dragCards(0, 1);
      await alice.until(
        "document.querySelector('[role=alert]')?.textContent.includes('previous order was restored') && document.querySelector('.group-grid > .group-card h3')?.textContent === 'Roommates'",
      );
      await alice.command("Page.reload");
      await alice.until(
        "document.querySelector('.group-card h3')?.textContent === 'Roommates' && !document.querySelector('fieldset').disabled",
      );
      if (process.env.ONDECK_SCREENSHOT) {
        const result = await alice.command("Page.captureScreenshot", {
          format: "png",
        });
        await Bun.write(
          process.env.ONDECK_SCREENSHOT.replace(/\.png$/, "-groups.png"),
          Buffer.from(result.data, "base64"),
        );
      }
      await alice.command("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: true,
      });
      expect(
        await alice.evaluate(
          "document.documentElement.scrollWidth <= window.innerWidth",
        ),
      ).toBe(true);
      expect(
        await alice.evaluate(
          "getComputedStyle(document.querySelector('.menu-toggle')).display",
        ),
      ).toBe("block");
      await alice.command("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 1,
      });
      await alice.until("matchMedia('(hover: none)').matches");
      await alice.dragCards(0, 1, true);
      await alice.until(
        "document.querySelector('.group-order-status')?.textContent === 'Group order saved.'",
      );
      await alice.click("Menu");
      await alice.click("Add activity");
      expect(
        await alice.evaluate(
          "document.querySelector('.add-page input').getBoundingClientRect().top < 300",
        ),
      ).toBe(true);
      const screenshot = process.env.ONDECK_SCREENSHOT;
      if (screenshot) {
        const result = await alice.command("Page.captureScreenshot", {
          format: "png",
        });
        await Bun.write(screenshot, Buffer.from(result.data, "base64"));
      }
      await alice.click("Menu");
      await alice.click("Groups");
      await alice.evaluate(
        "[...document.querySelectorAll('.group-card')].find(card=>card.querySelector('h3').textContent==='Book club').querySelector('.card-delete').click()",
      );
      expect(
        await alice.evaluate("document.querySelectorAll('.group-card').length"),
      ).toBe(2);
      await alice.until(
        "document.querySelector('.confirm-dialog').open && document.activeElement.textContent==='Cancel'",
      );
      expect(
        await alice.evaluate(
          "document.querySelector('#confirmation-title').textContent.includes('Book club')",
        ),
      ).toBe(true);
      if (process.env.ONDECK_SCREENSHOT) {
        const result = await alice.command("Page.captureScreenshot", {
          format: "png",
        });
        await Bun.write(
          process.env.ONDECK_SCREENSHOT.replace(/\.png$/, "-confirmation.png"),
          Buffer.from(result.data, "base64"),
        );
      }
      await alice.command("Input.dispatchKeyEvent", {
        type: "keyDown",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await alice.command("Input.dispatchKeyEvent", {
        type: "keyUp",
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
      await alice.until("!document.querySelector('.confirm-dialog').open");
      expect(
        await alice.evaluate("document.querySelectorAll('.group-card').length"),
      ).toBe(2);
      await alice.evaluate(
        "[...document.querySelectorAll('.group-card')].find(card=>card.querySelector('h3').textContent==='Book club').querySelector('.card-delete').click()",
      );
      await alice.evaluate(
        "document.querySelector('.confirm-dialog .danger-button').click()",
      );
      await alice.until(
        "document.querySelectorAll('.group-card').length===1 && !document.querySelector('fieldset').disabled",
      );
      await bob.click("Groups");
      await bob.click("Members");
      await bob.until(
        "!!document.querySelector('.group-management') && !document.querySelector('fieldset').disabled",
      );
      await bob.click("Leave group");
      expect(
        await bob.evaluate("!!document.querySelector('.group-management')"),
      ).toBe(true);
      await bob.evaluate(
        "document.querySelector('.confirm-dialog button').click()",
      );
      await bob.click("Leave group");
      await bob.evaluate(
        "document.querySelector('.confirm-dialog .danger-button').click()",
      );
      await bob.until(
        "!document.querySelector('.group-management') && document.querySelectorAll('.group-card').length===0",
      );
      await alice.click("Menu");
      await alice.click("On Deck");
      await alice.until(
        "!!document.querySelector('.activity-delete') && !document.querySelector('fieldset').disabled",
      );
      expect(
        await alice.evaluate(
          "getComputedStyle(document.querySelector('.activity-delete')).opacity",
        ),
      ).toBe("1");
      await alice.evaluate(
        "document.querySelector('.activity-delete').click()",
      );
      await alice.until("document.querySelector('.confirm-dialog').open");
      expect(
        await alice.evaluate(
          "!document.querySelector('.detail') && document.querySelectorAll('.activity-card').length===1",
        ),
      ).toBe(true);
      await alice.evaluate(
        "document.querySelector('.confirm-dialog button').click()",
      );
      expect(
        await alice.evaluate(
          "document.querySelectorAll('.activity-card').length",
        ),
      ).toBe(1);
      await alice.evaluate(
        "document.querySelector('.activity-delete').click()",
      );
      await alice.until("document.querySelector('.confirm-dialog').open");
      await alice.evaluate(
        "document.querySelector('.confirm-dialog .danger-button').click()",
      );
      await alice.until(
        "document.querySelectorAll('.activity-card').length===0 && !document.querySelector('fieldset').disabled",
      );
      expect(discoveryCalls).toBe(1);
      console.info("Browser: recover partial sharing after a selected group disappears");
      const call = async (path: string, input: Record<string, unknown>) => {
        const response = await fetch(new URL(`/api${path}`, backend.url), {
          method: "POST", headers: { Authorization: "Bearer retry", "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        expect(response.status).toBe(200);
        return response.json() as Promise<any>;
      };
      const first = await call("/groups/create", { name: "A Saved" });
      const removed = await call("/groups/create", { name: "B Removed" });
      const recovery = await call("/groups/create", { name: "C Recovery" });
      const retry = await page("retry");
      await retry.until("document.querySelectorAll('.group-card').length===3 && !document.querySelector('fieldset').disabled");
      await retry.click("Add activity");
      await retry.input('input[placeholder="Coffee"]', "Shared despite interruption");
      await retry.evaluate(`document.querySelectorAll('.share-picker label').forEach(label => {
        const input = label.querySelector('input');
        const selected = !label.textContent.includes('C Recovery');
        if (input.checked !== selected) input.click();
      })`);
      const beforeConfirmations = confirmations;
      sharesUntilFailure = 2;
      await retry.click("Save and share");
      await retry.until("document.querySelector('.activity-form')?.textContent.includes('Retry sharing') && document.querySelector('[role=alert]')?.textContent.includes('unavailable') && !document.querySelector('fieldset').disabled");
      expect(await retry.evaluate("document.querySelector('.share-picker input:disabled')?.checked")).toBe(true);
      await call("/groups/delete", { group: removed.group });
      await retry.until("document.querySelectorAll('.share-picker label').length===2");
      const recoveryNotice = await retry.evaluate("document.querySelector('.sharing-notice')?.textContent");
      await retry.evaluate("[...document.querySelectorAll('.share-picker label')].find(label=>label.textContent.includes('C Recovery')).querySelector('input').click()");
      await retry.click("Retry sharing");
      await retry.until("document.querySelector('.activity-grid h3')?.textContent==='Shared despite interruption' && !document.querySelector('fieldset').disabled");
      const firstShares = await app.concepts.Suggesting._forGroup({ group: first.group });
      const recoveredShares = await app.concepts.Suggesting._forGroup({ group: recovery.group });
      expect(firstShares).toHaveLength(1);
      expect(recoveredShares).toHaveLength(1);
      expect(firstShares[0]!.item).toBe(recoveredShares[0]!.item);
      expect(confirmations - beforeConfirmations).toBe(1);
      expect(recoveryNotice).toContain("successful shares are saved");
      expect(await app.concepts.Suggesting._forGroup({ group: removed.group })).toEqual([]);
      expect(retry.errors).toEqual([]);
      expect(alice.errors).toEqual([]);
      expect(bob.errors).toEqual([]);
    } finally {
      await Promise.allSettled([...inFlight]);
      for (const page of pages) page.socket.close();
      chrome.kill();
      await chrome.exited;
      frontend.stop(true);
      backend.stop(true);
      await app.beginDrain();
      await db.dropDatabase();
      await mongo.close();
      await rm(profile, { recursive: true, force: true });
    }
  },
  45_000,
);
