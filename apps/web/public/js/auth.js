// Enhance the shared HTML authentication forms, OAuth consent and sign-out.
import { toast } from "./toast.js";

async function authPost(path, body) {
  const signed = new URLSearchParams(location.search);
  if (signed.has("sig")) body.oauth_query = signed.toString();
  const r = await fetch("/api/auth/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.message || "The request could not be completed.");
  return data;
}

const safeNext = (dest) =>
  dest &&
  dest.startsWith("/") &&
  !dest.startsWith("//") &&
  !/[\x00-\x20\x7f\\]/.test(dest)
    ? dest
    : "/account";

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.dataset.auth) return;
  event.preventDefault();
  const button = event.submitter,
    action = form.dataset.auth,
    values = Object.fromEntries(new FormData(form));
  if (button) button.disabled = true;
  const status =
    form.closest(".card")?.querySelector("[role=status]") ??
    document.querySelector("main [role=status]");
  if (status) status.textContent = "";
  try {
    if (action === "flow") {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new URLSearchParams(values),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.message || "The request could not be completed.",
        );
      location.assign(result.url);
    }
    if (action === "send") {
      await authPost("email-otp/send-verification-otp", {
        email: values.email,
        type: "sign-in",
      });
      document.querySelector("#verify").hidden = false;
      document.querySelector("#verify [name=email]").value = values.email;
      document.querySelector("[name=otp]").focus();
      status.textContent = "Check your inbox for your six-digit code.";
    }
    if (action === "verify") {
      const r = await authPost("sign-in/email-otp", values);
      location.assign(
        r.url ||
          "/signed-in?next=" +
            encodeURIComponent(
              safeNext(new URLSearchParams(location.search).get("next")),
            ),
      );
    }
    if (action === "consent") {
      const r = await authPost("oauth2/consent", {
        accept: button?.value === "yes",
        oauth_query: location.search.slice(1),
      });
      location.assign(r.url);
    }
    if (action === "logout") {
      await authPost("sign-out", {});
      location.assign("/");
    }
  } catch (error) {
    if (status) status.textContent = error.message;
    else toast(error.message, { tone: "error" });
  } finally {
    if (button) button.disabled = false;
  }
});
