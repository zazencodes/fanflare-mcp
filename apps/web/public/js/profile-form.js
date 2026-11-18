// Saves the profile settings form through /api/profile and shows refusals in place.
// Without scripts the same form posts natively; "Keep these and continue" always does.
import { reward } from "./reward.js";
import { toast } from "./toast.js";

for (const form of document.querySelectorAll("[data-profile-form]")) {
  form.addEventListener("submit", async (event) => {
    const submitter = event.submitter;
    if (submitter?.hasAttribute("formaction")) return;
    event.preventDefault();
    const status = form.querySelector("[data-form-status]");
    const data = Object.fromEntries(new FormData(form));
    if (submitter) submitter.disabled = true;
    status.textContent = "";
    try {
      const r = await fetch(form.action, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Your profile was not saved.");
      await reward(result.sparks, "Profile saved", { next: data.next });
    } catch (error) {
      status.textContent = error.message;
      toast(error.message, { tone: "error" });
      form.querySelector("[name=request_key]").value = crypto.randomUUID();
      if (submitter) submitter.disabled = false;
    }
  });
}
