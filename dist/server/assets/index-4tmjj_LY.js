import { J as registerPlugin } from "./router-MRDiWsF1.js";
import "./server-IgbPzm8M.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-DmKlMQSs.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
