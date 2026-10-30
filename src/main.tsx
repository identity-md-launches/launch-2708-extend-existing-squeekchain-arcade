import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import "@fontsource/inter/latin-400.css";
import "@fontsource/pixelify-sans/latin-500.css";
import "@fontsource/pixelify-sans/latin-700.css";
import "./styles.css";
import App from "./App";
import { config } from "./wallet/wagmi";
import { WalletSheetProvider } from "./wallet/ConnectSheet";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <WalletSheetProvider>
          <App />
        </WalletSheetProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>,
);
