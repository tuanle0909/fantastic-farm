import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import '@mysten/dapp-kit/dist/index.css'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createNetworkConfig, SuiClientProvider, WalletProvider } from '@mysten/dapp-kit'
import { getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc'
import { BrowserRouter } from 'react-router-dom'

const SUI_NETWORK = import.meta.env.VITE_SUI_NETWORK ?? 'testnet'
const SUI_CHAIN = import.meta.env.VITE_REQUIRED_SUI_CHAIN ?? 'sui:testnet'
const SUI_RPC_URL = import.meta.env.VITE_SUI_RPC_URL ?? getJsonRpcFullnodeUrl('testnet')
const WALLET_ORIGIN = import.meta.env.VITE_SLUSH_WALLET_ORIGIN ?? 'https://slush.app'
const PREFERRED_WALLET = import.meta.env.VITE_PREFERRED_WALLET ?? 'Slush'

const { networkConfig } = createNetworkConfig({
    [SUI_NETWORK]: { url: SUI_RPC_URL, network: SUI_CHAIN },
})

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <SuiClientProvider networks={networkConfig} defaultNetwork={SUI_NETWORK}>
                <WalletProvider
                    autoConnect
                    slushWallet={{ name: 'Slush', origin: WALLET_ORIGIN }}
                    preferredWallets={[PREFERRED_WALLET]}
                >
                    <BrowserRouter>
                        <App />
                    </BrowserRouter>
                </WalletProvider>
            </SuiClientProvider>
        </QueryClientProvider>
    </StrictMode>,
)
