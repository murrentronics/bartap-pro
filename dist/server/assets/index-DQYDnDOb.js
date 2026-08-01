import { x as registerPlugin } from "./router-BW3vb4yu.js";
import "./server-DklmIEK8.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-D2iCzqkt.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
