import "./style.css";
import { Game } from "./game/Game";

const canvas = document.getElementById("view");
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error("Missing canvas");
}

const boot = document.querySelector(".fine");
if (boot) boot.textContent = "Paving Shell Beach…";

const game = new Game(canvas);
game
  .load()
  .then(() => {
    if (boot) boot.textContent = "WASD to move · F to drive, fly, or board · M for the map";
    game.run();
  })
  .catch((err: unknown) => {
    const card = document.querySelector(".title-card");
    if (card) {
      card.textContent = err instanceof Error ? err.message : "The county failed to load.";
    }
    console.error(err);
  });
