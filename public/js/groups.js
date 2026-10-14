import { api, ensureFan, toast } from "./common.js";

// Creates a friend league from a name input and opens it.
export async function createGroupFrom(input) {
  const name = input.value.trim();
  if (name.length < 2) {
    toast("Give your league a name.");
    input.focus();
    return;
  }
  if (!(await ensureFan())) return;
  try {
    const { id } = await api("/api/groups", { method: "POST", body: { name } });
    location.href = `/l/${encodeURIComponent(id)}?new=1`;
  } catch (err) {
    toast(err.message);
  }
}
