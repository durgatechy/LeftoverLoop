
const foodMap = new Map();
const shoppingSet = new Set();

let nextFoodId = 1;
let nextShoppingId = 1;
let toastTimer;

const recipes = [
  {
    name: "Tomato Rice",
    emoji: "🍅",
    ingredients: ["rice", "tomato", "spices"],
    tags: ["rice", "tomato"],
    description: "A simple rice dish with tomatoes and spices."
  },
  {
    name: "Vegetable Fried Rice",
    emoji: "🥕",
    ingredients: ["rice", "vegetables", "oil", "spices"],
    tags: ["rice", "vegetable"],
    description: "Combine rice and vegetables for a quick meal."
  },
  {
    name: "Cheese Toast",
    emoji: "🧀",
    ingredients: ["bread", "cheese"],
    tags: ["bread", "cheese"],
    description: "Toast bread with cheese until melted."
  },
  {
    name: "Vegetable Sandwich",
    emoji: "🥪",
    ingredients: ["bread", "vegetables"],
    tags: ["bread", "vegetable"],
    description: "Make a sandwich with vegetables you have."
  },
  {
    name: "Vegetable Rice Bowl",
    emoji: "🍚",
    ingredients: ["rice", "vegetables"],
    tags: ["rice", "vegetable"],
    description: "A flexible bowl made with rice and vegetables."
  },
  {
    name: "Tomato Cheese Toast",
    emoji: "🍞",
    ingredients: ["bread", "tomato", "cheese"],
    tags: ["bread", "tomato", "cheese"],
    description: "Add tomato and cheese to toast."
  }
];

function saveData() {
  localStorage.setItem("leftoverLoopFood", JSON.stringify([...foodMap.values()]));
  localStorage.setItem("leftoverLoopShopping", JSON.stringify([...shoppingSet]));
  localStorage.setItem("leftoverLoopCounters", JSON.stringify({
    nextFoodId,
    nextShoppingId
  }));
}

function loadData() {
  try {
    const savedFood = JSON.parse(localStorage.getItem("leftoverLoopFood") || "[]");
    savedFood.forEach(item => foodMap.set(item.id, item));

    const savedShopping = JSON.parse(localStorage.getItem("leftoverLoopShopping") || "[]");
    savedShopping.forEach(item => shoppingSet.add(item));

    const counters = JSON.parse(localStorage.getItem("leftoverLoopCounters") || "{}");
    nextFoodId = Math.max(
      Number(counters.nextFoodId) || 1,
      ...[...foodMap.keys()].map(id => Number(id) + 1)
    );
    nextShoppingId = Number(counters.nextShoppingId) || 1;
  } catch (error) {
    console.error("Could not load saved data:", error);
    showToast("Some saved data could not be loaded.");
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(page => {
    page.classList.add("hidden");
  });

  const page = document.getElementById(pageId);
  if (page) page.classList.remove("hidden");

  if (pageId === "home") renderHome();
  if (pageId === "fridge") renderFood();
  if (pageId === "recipes") renderRecipes();
  if (pageId === "shopping") renderShopping();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getFoodEmoji(category) {
  const emojis = {
    "Cooked Food": "🍱",
    "Vegetables": "🥕",
    "Fruits": "🍎",
    "Dairy": "🥛",
    "Bakery": "🍞",
    "Other": "🥡"
  };
  return emojis[category] || "🥡";
}

function getFoodStatus(item) {
  if (item.used) return { label: "Used", className: "" };

  if (!item.reviewDate) {
    return { label: "No review date", className: "" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const reviewDate = new Date(item.reviewDate + "T00:00:00");
  const days = Math.round((reviewDate - today) / 86400000);

  if (days < 0) return { label: "Review date passed", className: "past" };
  if (days <= 2) return { label: "Check soon", className: "warning" };

  return { label: "Review planned", className: "" };
}

function formatDate(dateString) {
  if (!dateString) return "Not recorded";

  const date = new Date(dateString + "T00:00:00");
  return Number.isNaN(date.getTime())
    ? "Not recorded"
    : date.toLocaleDateString();
}

function createFoodCard(item) {
  const card = document.createElement("article");
  card.className = "food-card";

  const emoji = document.createElement("div");
  emoji.className = "food-emoji";
  emoji.textContent = getFoodEmoji(item.category);

  const title = document.createElement("h3");
  title.textContent = item.name;

  const category = document.createElement("p");
  category.textContent = `${item.category} · ${item.quantity || "Quantity not set"}`;

  const location = document.createElement("p");
  location.textContent = `📍 ${item.location}`;

  const date = document.createElement("p");
  date.textContent = `Review date: ${formatDate(item.reviewDate)}`;

  const status = getFoodStatus(item);
  const badge = document.createElement("span");
  badge.className = `status ${status.className}`;
  badge.textContent = status.label;

  card.append(emoji, title, category, location, date, badge);

  if (item.notes) {
    const notes = document.createElement("p");
    notes.textContent = `Note: ${item.notes}`;
    card.appendChild(notes);
  }

  const actions = document.createElement("div");
  actions.className = "card-actions";

  if (!item.used) {
    const usedButton = document.createElement("button");
    usedButton.textContent = "✓ Mark used";
    usedButton.onclick = () => markUsed(item.id);
    actions.appendChild(usedButton);

    const editButton = document.createElement("button");
    editButton.textContent = "✎ Edit";
    editButton.onclick = () => editFood(item.id);
    actions.appendChild(editButton);
  }

  const deleteButton = document.createElement("button");
  deleteButton.textContent = "Delete";
  deleteButton.onclick = () => deleteFood(item.id);
  actions.appendChild(deleteButton);

  card.appendChild(actions);
  return card;
}

function renderFood() {
  const grid = document.getElementById("foodGrid");
  if (!grid) return;

  grid.replaceChildren();

  const search = (document.getElementById("searchFood")?.value || "")
    .trim().toLowerCase();
  const category = document.getElementById("filterCategory")?.value || "All";
  const sort = document.getElementById("sortFood")?.value || "date";

  let items = [...foodMap.values()].filter(item => {
    const matchesSearch =
      item.name.toLowerCase().includes(search) ||
      (item.notes || "").toLowerCase().includes(search);

    return matchesSearch &&
      (category === "All" || item.category === category);
  });

  items.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name);
    return (a.reviewDate || "9999-12-31")
      .localeCompare(b.reviewDate || "9999-12-31");
  });

  if (items.length === 0) {
    grid.innerHTML = '<div class="empty-state">🧊<br>No matching food items yet.<br>Add some food to get started!</div>';
    return;
  }

  items.forEach(item => grid.appendChild(createFoodCard(item)));
}

function renderHome() {
  const active = [...foodMap.values()].filter(item => !item.used);
  const needsReview = active.filter(item => {
    const status = getFoodStatus(item);
    return status.className === "warning" || status.className === "past";
  });

  document.getElementById("totalCount").textContent = active.length;
  document.getElementById("soonCount").textContent = needsReview.length;
  document.getElementById("shoppingCount").textContent =
    [...shoppingSet].filter(item => !item.done).length;

  const priority = document.getElementById("priorityFood");
  priority.replaceChildren();

  const sorted = [...active].sort((a, b) => {
    return (a.reviewDate || "9999-12-31")
      .localeCompare(b.reviewDate || "9999-12-31");
  }).slice(0, 3);

  if (!sorted.length) {
    priority.innerHTML =
      '<div class="empty-state">Your fridge is waiting! Add your first food item.</div>';
    return;
  }

  sorted.forEach(item => priority.appendChild(createFoodCard(item)));
}

document.getElementById("foodForm").addEventListener("submit", event => {
  event.preventDefault();

  const name = document.getElementById("foodName").value.trim();
  const storedDate = document.getElementById("foodStored").value;
  const reviewDate = document.getElementById("foodExpiry").value;

  if (!name) {
    showToast("Please enter a food name.");
    return;
  }

  if (storedDate && reviewDate && reviewDate < storedDate) {
    showToast("Review date cannot be before the stored date.");
    return;
  }

  const item = {
    id: nextFoodId++,
    name,
    category: document.getElementById("foodCategory").value,
    quantity: document.getElementById("foodQuantity").value.trim(),
    location: document.getElementById("foodLocation").value,
    storedDate,
    reviewDate,
    notes: document.getElementById("foodNotes").value.trim(),
    used: false
  };

  foodMap.set(item.id, item);
  saveData();
  event.target.reset();
  showToast("Food item added successfully!");
  showPage("fridge");
});

function markUsed(id) {
  const item = foodMap.get(id);
  if (!item) return;

  item.used = true;
  saveData();
  renderFood();
  renderHome();
  showToast("Item marked as used.");
}

function deleteFood(id) {
  if (!confirm("Delete this food item?")) return;

  foodMap.delete(id);
  saveData();
  renderFood();
  renderHome();
  showToast("Food item deleted.");
}

function editFood(id) {
  const item = foodMap.get(id);
  if (!item) return;

  const name = prompt("Food name:", item.name);
  if (name === null) return;

  if (!name.trim()) {
    showToast("Food name cannot be empty.");
    return;
  }

  const quantity = prompt("Quantity:", item.quantity || "");
  if (quantity === null) return;

  const reviewDate = prompt(
    "Review date (YYYY-MM-DD), or leave blank:",
    item.reviewDate || ""
  );
  if (reviewDate === null) return;

  if (reviewDate && !/^\d{4}-\d{2}-\d{2}$/.test(reviewDate)) {
    showToast("Enter the date as YYYY-MM-DD.");
    return;
  }

  if (reviewDate && Number.isNaN(new Date(reviewDate + "T00:00:00").getTime())) {
    showToast("Please enter a valid date.");
    return;
  }

  if (reviewDate && item.storedDate && reviewDate < item.storedDate) {
    showToast("Review date cannot be before the stored date.");
    return;
  }

  item.name = name.trim();
  item.quantity = quantity.trim();
  item.reviewDate = reviewDate;

  saveData();
  renderFood();
  renderHome();
  showToast("Food item updated.");
}

function renderRecipes() {
  const grid = document.getElementById("recipeGrid");
  if (!grid) return;

  grid.replaceChildren();

  const selected = document.getElementById("recipeIngredient").value;
  const availableNames = [...foodMap.values()]
    .filter(item => !item.used)
    .map(item => item.name.toLowerCase());

  const filtered = recipes.filter(recipe =>
    selected === "all" || recipe.tags.includes(selected)
  );

  filtered.forEach(recipe => {
    const available = recipe.ingredients.filter(ingredient =>
      availableNames.some(name => name.includes(ingredient))
    );
    const missing = recipe.ingredients.filter(ingredient =>
      !available.includes(ingredient)
    );

    const card = document.createElement("article");
    card.className = "food-card recipe-card";

    const emoji = document.createElement("div");
    emoji.className = "recipe-emoji";
    emoji.textContent = recipe.emoji;

    const title = document.createElement("h3");
    title.textContent = recipe.name;

    const description = document.createElement("p");
    description.textContent = recipe.description;

    const ingredients = document.createElement("p");
    ingredients.textContent = `Ingredients: ${recipe.ingredients.join(", ")}`;

    const match = document.createElement("p");
    match.textContent = available.length
      ? `Possible matches in your fridge: ${available.join(", ")}`
      : "No matching ingredients recorded yet.";

    const button = document.createElement("button");
    button.className = "primary";
    button.textContent = "Add missing ingredients";
    button.onclick = () => {
      if (!missing.length) {
        showToast("All listed ingredients have a possible match!");
        return;
      }

      missing.forEach(name => {
        shoppingSet.add({
          id: nextShoppingId++,
          name: name[0].toUpperCase() + name.slice(1),
          done: false
        });
      });

      saveData();
      renderHome();
      showToast("Missing ingredients added to your list.");
    };

    card.append(emoji, title, description, ingredients, match, button);
    grid.appendChild(card);
  });

  if (!filtered.length) {
    grid.innerHTML = '<div class="empty-state">No recipe ideas found.</div>';
  }
}

document.getElementById("shoppingForm").addEventListener("submit", event => {
  event.preventDefault();

  const input = document.getElementById("shoppingInput");
  const name = input.value.trim();

  if (!name) return;

  shoppingSet.add({
    id: nextShoppingId++,
    name,
    done: false
  });

  input.value = "";
  saveData();
  renderShopping();
  renderHome();
  showToast("Shopping item added.");
});

function renderShopping() {
  const list = document.getElementById("shoppingItems");
  list.replaceChildren();

  if (!shoppingSet.size) {
    list.innerHTML = '<li class="empty-state">Your shopping list is empty.</li>';
    return;
  }

  shoppingSet.forEach(item => {
    const li = document.createElement("li");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = item.done;
    checkbox.setAttribute("aria-label", `Mark ${item.name} as purchased`);

    const name = document.createElement("span");
    name.className = `item-name ${item.done ? "done" : ""}`;
    name.textContent = item.name;

    checkbox.addEventListener("change", () => {
      item.done = checkbox.checked;
      saveData();
      renderShopping();
      renderHome();
    });

    const remove = document.createElement("button");
    remove.className = "delete-button";
    remove.textContent = "✕";
    remove.setAttribute("aria-label", `Remove ${item.name}`);
    remove.onclick = () => {
      shoppingSet.delete(item);
      saveData();
      renderShopping();
      renderHome();
    };

    li.append(checkbox, name, remove);
    list.appendChild(li);
  });
}

function clearCompleted() {
  [...shoppingSet].forEach(item => {
    if (item.done) shoppingSet.delete(item);
  });

  saveData();
  renderShopping();
  renderHome();
  showToast("Completed items cleared.");
}

// Start the application
loadData();
renderHome();
renderFood();
renderRecipes();
renderShopping();
