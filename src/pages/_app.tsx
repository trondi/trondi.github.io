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
        <Component {...pageProps} />
      </Layout>
          </PersistGate>
      </Provider>
  )
}
