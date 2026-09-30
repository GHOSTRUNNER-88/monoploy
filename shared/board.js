// The 40 squares, clockwise from Start. Shared by the server (rules) and the client (drawing).
// rent: [base, 1 house, 2, 3, 4, hotel]

export const GROUPS = {
  egypt: { name: "Egypt", color: "#8b5a3c", house: 50 },
  nepal: { name: "Nepal", color: "#6cc4e8", house: 50 },
  italy: { name: "Italy", color: "#d6509b", house: 100 },
  germany: { name: "Germany", color: "#f08a24", house: 100 },
  china: { name: "China", color: "#e0393e", house: 150 },
  france: { name: "France", color: "#f2c230", house: 150 },
  uk: { name: "United Kingdom", color: "#2e9e5b", house: 200 },
  usa: { name: "United States", color: "#3a5fd9", house: 200 },
};

const city = (name, group, price, rent) => ({ type: "city", name, group, price, rent });
const airport = (name) => ({ type: "airport", name, price: 200 });
const company = (name) => ({ type: "company", name, price: 150 });

export const BOARD = [
  { type: "start", name: "Start" },
  city("Alexandria", "egypt", 60, [2, 10, 30, 90, 160, 250]),
  { type: "treasure", name: "Treasure" },
  city("Cairo", "egypt", 60, [4, 20, 60, 180, 320, 450]),
  { type: "tax", name: "Income tax", amount: 200 },
  airport("Tribhuvan Airport"),
  city("Pokhara", "nepal", 100, [6, 30, 90, 270, 400, 550]),
  { type: "surprise", name: "Surprise" },
  city("Lalitpur", "nepal", 100, [6, 30, 90, 270, 400, 550]),
  city("Kathmandu", "nepal", 120, [8, 40, 100, 300, 450, 600]),
  { type: "jail", name: "Jail" },
  city("Venice", "italy", 140, [10, 50, 150, 450, 625, 750]),
  company("Power Company"),
  city("Milan", "italy", 140, [10, 50, 150, 450, 625, 750]),
  city("Rome", "italy", 160, [12, 60, 180, 500, 700, 900]),
  airport("Frankfurt Airport"),
  city("Hamburg", "germany", 180, [14, 70, 200, 550, 750, 950]),
  { type: "treasure", name: "Treasure" },
  city("Munich", "germany", 180, [14, 70, 200, 550, 750, 950]),
  city("Berlin", "germany", 200, [16, 80, 220, 600, 800, 1000]),
  { type: "vacation", name: "Vacation" },
  city("Shenzhen", "china", 220, [18, 90, 250, 700, 875, 1050]),
  { type: "surprise", name: "Surprise" },
  city("Beijing", "china", 220, [18, 90, 250, 700, 875, 1050]),
  city("Shanghai", "china", 240, [20, 100, 300, 750, 925, 1100]),
  airport("Charles de Gaulle"),
  city("Lyon", "france", 260, [22, 110, 330, 800, 975, 1150]),
  city("Toulouse", "france", 260, [22, 110, 330, 800, 975, 1150]),
  company("Water Company"),
  city("Paris", "france", 280, [24, 120, 360, 850, 1025, 1200]),
  { type: "gotojail", name: "Go to jail" },
  city("Liverpool", "uk", 300, [26, 130, 390, 900, 1100, 1275]),
  city("Manchester", "uk", 300, [26, 130, 390, 900, 1100, 1275]),
  { type: "treasure", name: "Treasure" },
  city("London", "uk", 320, [28, 150, 450, 1000, 1200, 1400]),
  airport("JFK Airport"),
  { type: "surprise", name: "Surprise" },
  city("San Francisco", "usa", 350, [35, 175, 500, 1100, 1300, 1500]),
  { type: "tax", name: "Luxury tax", amount: 100 },
  city("New York", "usa", 400, [50, 200, 600, 1400, 1700, 2000]),
];

export const JAIL = 10;
export const AIRPORT_RENT = [25, 50, 100, 200];
export const COMPANY_MULTIPLIER = [4, 10];
export const START_MONEY = 1500;
export const PASS_START = 200;
export const JAIL_FINE = 50;
export const MAX_PLAYERS = 6;
export const COLORS = ["#ff5a5f", "#3ec1d3", "#ffc93c", "#8e6cef", "#4cd964", "#ff8c42"];

export const isOwnable = (tile) => tile.type === "city" || tile.type === "airport" || tile.type === "company";
export const groupTiles = (group) => BOARD.flatMap((t, i) => (t.group === group ? [i] : []));
