import { ref, onMounted, onUnmounted } from "vue/dist/vue.esm-browser.js";
import { Clerk } from "@clerk/clerk-js";

/** Clerk session and authentication controls; no group or activity state lives here. */
export function useAuth(onAccountChange: () => void) {
  const user = ref(""), accountName = ref("");
  const authReady = ref(false), authError = ref("");
  let clerk: Clerk | undefined;
  let unsubscribe: (() => void) | undefined;
  async function initializeAuth() {
    try {
      const response = await fetch("/config");
      if (!response.ok) throw new Error("Could not load sign-in settings.");
      const config = await response.json() as { clerkPublishableKey?: string };
      if (!config.clerkPublishableKey) throw new Error("Clerk is not configured. Add the Clerk keys to .env and restart the servers.");
      clerk = new Clerk(config.clerkPublishableKey);
      Object.assign(window, { Clerk: clerk });
      // Clerk's official browser UI bundle includes its own rendering dependencies.
      await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `https://${clerk!.frontendApi}/npm/@clerk/ui@1/dist/ui.browser.js`;
        script.async = true;
        script.crossOrigin = "anonymous";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Could not load the sign-in screen. Please reload."));
        document.head.appendChild(script);
      });
      const ui = (window as Window & {
        __internal_ClerkUICtor?: NonNullable<NonNullable<Parameters<Clerk["load"]>[0]>["ui"]>["ClerkUI"];
      }).__internal_ClerkUICtor;
      if (!ui) throw new Error("The sign-in screen did not initialize. Please reload.");
      await clerk.load({ ui: { ClerkUI: ui }, signInFallbackRedirectUrl: window.location.href, signUpFallbackRedirectUrl: window.location.href, afterSignOutUrl: "/" });
      unsubscribe = clerk.addListener(({ user: account, session }) => {
        const nextUser = session?.status === "active" ? account?.id ?? "" : "";
        accountName.value = account?.fullName || account?.primaryEmailAddress?.emailAddress || "Your account";
        authReady.value = true;
        if (nextUser === user.value) return;
        user.value = nextUser;
        onAccountChange();
      });
    } catch (reason) {
      authError.value = reason instanceof Error ? reason.message : "Could not load sign-in. Please reload.";
      authReady.value = true;
    }
  }
  function signIn() { clerk?.openSignIn(); }
  function signUp() { clerk?.openSignUp(); }
  function editProfile() { clerk?.openUserProfile(); }
  onMounted(initializeAuth);
  onUnmounted(() => unsubscribe?.());
  return { user, accountName, authReady, authError, signIn, signUp, editProfile,
    getToken: async () => await clerk?.session?.getToken() ?? null,
    signOut: async () => { await clerk?.signOut({ redirectUrl: window.location.href }); },
  };
}
