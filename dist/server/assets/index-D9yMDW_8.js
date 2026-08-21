import { J as registerPlugin } from "./router-CZOM4-ob.js";
import "./server-8GG21qKo.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-DPInL5_X.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
