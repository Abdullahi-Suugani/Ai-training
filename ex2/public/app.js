const $ = (s) => document.querySelector(s),
  promptEl = $("#prompt"),
  gallery = $("#gallery"),
  count = $("#count");
document.querySelectorAll(".size").forEach((label) =>
  label.addEventListener("click", () => {
    const input = label.querySelector("input");
    setTimeout(() => label.classList.toggle("selected", input.checked), 0);
  }),
);
document
  .querySelectorAll(".suggestions button")
  .forEach((b) => (b.onclick = () => (promptEl.value = b.dataset.prompt)));
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2600);
}
$("#clearBtn").onclick = () => {
  promptEl.value = "";
  gallery.className = "gallery empty";
  gallery.innerHTML =
    '<div class="empty-state"><div class="spark">✦</div><h3>Your canvas is waiting</h3><p>Choose a theme and generate a few variations to see them here.</p></div>';
  count.textContent = "0";
};
$("#generate").onclick = async () => {
  const sizes = [...document.querySelectorAll(".size input:checked")].map(
    (x) => x.value,
  );
  if (!promptEl.value.trim()) return toast("Add a theme first.");
  if (!sizes.length) return toast("Select at least one format.");
  gallery.className = "gallery";
  gallery.innerHTML = sizes
    .map(
      (s) =>
        `<div class="image-card ${s}"><div class="loading"></div><div class="meta"><b>${s[0].toUpperCase() + s.slice(1)}</b></div></div>`,
    )
    .join("");
  try {
    const r = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: promptEl.value,
        sizes,
        model: $("#model").value,
        quality: $("#quality").value,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error);
    gallery.innerHTML = data.images
      .map(
        (x) =>
          `<article class="image-card ${x.size}"><img src="${x.url}" alt="${x.size} variation"><div class="meta"><b>${x.size[0].toUpperCase() + x.size.slice(1)}</b><small>${data.live ? "LIVE" : "DEMO"}</small><p>${x.prompt}</p></div></article>`,
      )
      .join("");
    count.textContent = data.images.length;
    toast(
      data.live
        ? "Variations generated."
        : "Demo variations ready — add OPENAI_API_KEY for live generation.",
    );
  } catch (e) {
    toast(e.message);
    gallery.innerHTML = "";
  }
};
$("#downloadAll").onclick = () => {
  const images = [...gallery.querySelectorAll("img")];
  if (!images.length) return toast("Generate some images first.");
  images.forEach((img, i) => {
    const a = document.createElement("a");
    a.href = img.src;
    a.download = `canvas-variation-${i + 1}.jpg`;
    a.click();
  });
};
