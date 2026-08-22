import { J as registerPlugin } from "./router-BolBtekg.js";
import "./server-Dbw5lG0Z.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-BEQIk3O9.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
