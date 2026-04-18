const collections = {
  trending: [
    { title: "Orbit Finance", creator: "Eloise", tag: "PRO", remix: 128, likes: "1.2k", variant: "slate" },
    { title: "Helio Studio", creator: "Mason", tag: "PRO", remix: 96, likes: "986", variant: "sage" },
    { title: "Glide Commerce", creator: "Priya", tag: "$24", remix: 82, likes: "811", variant: "sand" },
    { title: "Atlas Academy", creator: "Noah", tag: "PRO", remix: 71, likes: "640", variant: "rose" },
    { title: "Drift Travel", creator: "Ines", tag: "$18", remix: 55, likes: "521", variant: "lime" },
    { title: "Linea Health", creator: "Jae", tag: "PRO", remix: 49, likes: "470", variant: "slate" },
  ],
  featured: [
    { title: "Monochrome SaaS", creator: "Ari", tag: "PRO", remix: 64, likes: "590", variant: "rose" },
    { title: "Arcadia Retail", creator: "Kim", tag: "$32", remix: 43, likes: "402", variant: "sand" },
    { title: "Pureline Studio", creator: "Lena", tag: "PRO", remix: 38, likes: "366", variant: "sage" },
    { title: "Neonbank", creator: "Xiu", tag: "$19", remix: 30, likes: "312", variant: "slate" },
    { title: "Northwind Labs", creator: "Remy", tag: "PRO", remix: 24, likes: "280", variant: "lime" },
    { title: "Field Notes", creator: "June", tag: "$12", remix: 19, likes: "210", variant: "rose" },
  ],
  free: [
    { title: "Starter Landing", creator: "Sam", tag: "FREE", remix: 120, likes: "2.1k", variant: "sand" },
    { title: "Minimal Resume", creator: "Ava", tag: "FREE", remix: 98, likes: "1.4k", variant: "slate" },
    { title: "Podcast Kit", creator: "Lee", tag: "FREE", remix: 66, likes: "930", variant: "sage" },
    { title: "Product Waitlist", creator: "Omar", tag: "FREE", remix: 55, likes: "770", variant: "lime" },
  ],
  pro: [
    { title: "Aurora Dashboard", creator: "Uma", tag: "PRO", remix: 88, likes: "1.1k", variant: "rose" },
    { title: "Studio CMS", creator: "Ivy", tag: "PRO", remix: 61, likes: "760", variant: "slate" },
    { title: "Velocity Commerce", creator: "Tariq", tag: "PRO", remix: 44, likes: "640", variant: "sand" },
    { title: "Ridge Analytics", creator: "Nia", tag: "PRO", remix: 36, likes: "520", variant: "sage" },
  ],
  paid: [
    { title: "Echelon Portfolio Pack", creator: "Ana", tag: "$29", remix: 40, likes: "540", variant: "lime" },
    { title: "Coastal Resort Suite", creator: "Finn", tag: "$25", remix: 32, likes: "420", variant: "sand" },
    { title: "Evo Fintech Kit", creator: "Zoe", tag: "$35", remix: 28, likes: "380", variant: "rose" },
    { title: "Studio Pro Pack", creator: "Kai", tag: "$39", remix: 21, likes: "310", variant: "slate" },
    { title: "Retail Expansion Kit", creator: "Mira", tag: "$28", remix: 17, likes: "260", variant: "sage" },
    { title: "Civic Platform", creator: "Amir", tag: "$22", remix: 14, likes: "210", variant: "sand" },
  ],
};

function tagClass(tag) {
  if (tag === "PRO") return "tag pro";
  if (tag === "FREE") return "tag";
  return "tag price";
}

function createCard(item) {
  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML = `
    <div class="card-preview" data-variant="${item.variant}">
      <div class="card-overlay">
        <span class="${tagClass(item.tag)}">${item.tag}</span>
      </div>
    </div>
    <div class="card-body">
      <div class="card-title">${item.title}</div>
      <div class="card-meta">
        <div class="creator">
          <div class="avatar">${item.creator.slice(0, 2).toUpperCase()}</div>
          <div>${item.creator}</div>
        </div>
        <div class="stats">
          <span>Remix ${item.remix}</span>
          <span>${item.likes}</span>
        </div>
      </div>
    </div>
  `;
  return card;
}

function render() {
  Object.keys(collections).forEach((key) => {
    const target = document.querySelector(`[data-collection="${key}"]`);
    if (!target) return;
    collections[key].forEach((item, index) => {
      const card = createCard(item);
      card.style.setProperty("--delay", `${index * 60}ms`);
      target.appendChild(card);
    });
  });
}

render();
