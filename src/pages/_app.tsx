import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { persistor, store, wrapper } from "@store/index";
import Layout from "@components/Layout";
import { Provider } from "react-redux";
import { PersistGate } from "redux-persist/integration/react";
import Header from "@components/Header";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <Provider store={store}>
      <PersistGate persistor={persistor} loading={null}>
        <Layout>
          <Header />
          <Component {...pageProps} />
        </Layout>
      </PersistGate>
    </Provider>
  );
}
