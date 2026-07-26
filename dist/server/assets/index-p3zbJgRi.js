import { v as registerPlugin } from "./router-CW3mfbLV.js";
import "./server-Du3Nct2o.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-CvBC0Lm4.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
