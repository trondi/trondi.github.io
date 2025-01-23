import '@/styles/globals.css';
import type { AppProps } from 'next/app';
import { persistor, store, wrapper } from '@store/index';
import Layout from '@components/Layout';
import {Provider} from "react-redux";
import {PersistGate} from "redux-persist/integration/react";

export default function App({ Component, pageProps }: AppProps) {
  return (
      <Provider store={store}>
          <PersistGate persistor={persistor} loading={null}>
              <Layout>
                  <header   className="flex justify-center items-center h-16 bg-gray-800 text-white">
                        <h1>Header</h1>
                    </header>
                <Component {...pageProps} />
              </Layout>
          </PersistGate>
      </Provider>
  )
}
