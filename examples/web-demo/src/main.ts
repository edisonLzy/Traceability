import { setupRegisterForm } from "./register";
import { initTraceability } from "./traceability";

import "./styles.css";

// Initialize Traceability monitoring
initTraceability();

// 用户注册表单（纯前端校验演示）
setupRegisterForm();
