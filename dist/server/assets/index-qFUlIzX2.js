import { v as registerPlugin } from "./router-Nt7e068I.js";
import "./server-DAWm70PB.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-eEl8ACpj.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
