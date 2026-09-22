import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// 必须在任何 Semi 组件之前引入：React 19 去掉了 ReactDOM.render，Toast /
// Notification / Modal.confirm 这类命令式接口要靠它注入 createRoot 才能挂载，
// 否则调用只会打一条 console 警告然后什么都不发生（错误提示就此静默消失）。
import "@douyinfe/semi-ui-19/react19-adapter";

import { setupHttpAuth } from "@/auth/http-auth";
import '@douyinfe/semi-ui-19/dist/css/semi.css'
import '@fontsource-variable/geist'
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/geist-mono'
import App from './App.tsx'

setupHttpAuth();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
