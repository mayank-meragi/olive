import { resolve } from "node:path"
import { defineConfig } from "wxt"

export default defineConfig({
  manifest: {
    permissions: [
      "storage",
      "tabs",
      "tabGroups",
      "https://generativelanguage.googleapis.com/*",
    ],
    host_permissions: ["<all_urls>"],
    // Firefox-native sidebar entry (shows under View → Sidebars)
    sidebar_action: {
      default_title: "Olive",
      default_panel: "sidebar.html",
    },
  },
  vite() {
    return {
      resolve: {
        alias: {
          "@/components": resolve(__dirname, "entrypoints/popup/components"),
          "@/lib": resolve(__dirname, "entrypoints/popup/lib"),
        },
      },
    }
  },
})
