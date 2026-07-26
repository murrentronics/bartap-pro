import { v as registerPlugin } from "./router-BEjYCpOU.js";
import "./server-DIvFPIYN.js";
import "node:async_hooks";
import "node:stream/web";
import "node:stream";
const Share = registerPlugin("Share", {
  web: () => import("./web-CvHxyiKE.js").then((m) => new m.ShareWeb())
});
export {
  Share
};
