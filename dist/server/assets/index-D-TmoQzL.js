import { K as registerPlugin } from "./router-B8ZM6qMb.js";
import "./server-ChNZdpo3.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-C9GMyPaQ.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
