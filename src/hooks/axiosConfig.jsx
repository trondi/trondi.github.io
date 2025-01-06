import Axios from 'axios';
import getConfig from 'next/config';
import { getDispatch, persistor, store } from '@store/index';
// import { getRefreshAccessTokenApi } from '@pages/api/userApi';
// import { fetchUserInfo } from '@store/auth/thunk';
// import { handleError } from '../middleware/errorHandler';

// const hideLoading = () => {
//   try {
//     if (process.browser) {
//       const warperid = document.getElementById("loader-wrapper");
//       if (warperid) {
//         warperid.style.display = "none";
//       }
//     }
//   } catch (e) {}
// };
// const showLoading = () => {
//   try {
//     if (process.browser) {
//       const warperid = document.getElementById("loader-wrapper");ㅅ
//       if (warperid) {
//         warperid.style.display = "block";
//       }
//     }
//   } catch (e) {}
// };

// 서버와 클라이언트에서 각각 적절한 환경 변수를 사용할 수 있도록 설정
const { publicRuntimeConfig, serverRuntimeConfig } = getConfig();

// const protocol = publicRuntimeConfig.NEXT_PUBLIC_FE_WEB_SERVER_PROTOCOL || 'http';
// const host = publicRuntimeConfig.NEXT_PUBLIC_FE_WEB_SERVER_URL || 'localhost';
// const port = publicRuntimeConfig.NEXT_PUBLIC_FE_WEB_SERVER_PORT || '8080';
//
// const serverApiUrl = serverRuntimeConfig ? serverRuntimeConfig.apiServer : null; // 서버사이드 환경의 API 서버 설정
// const clientApiUrl = `${protocol}://${host}:${port}`; // 클라이언트 사이드 URL 구성

// const baseURL = typeof window === 'undefined' ? serverApiUrl : clientApiUrl; // SSR과 CSR에 따른 baseURL 결정

const baseURL = 'http://localhost:8080';

// const baseURL = `${process.env.NEXT_PUBLIC_FE_WEB_SERVER_PROTOCOL}://${process.env.NEXT_PUBLIC_FE_WEB_SERVER_URL}:${process.env.NEXT_PUBLIC_FE_WEB_SERVER_PORT}`;

const createAxiosInstance = () => {
  return Axios.create({
    timeout: 60000,
    // baseURL: `${process.env.NEXT_PUBLIC_FE_WEB_SERVER_PROTOCOL}://${process.env.NEXT_PUBLIC_FE_WEB_SERVER_URL}:${process.env.NEXT_PUBLIC_FE_WEB_SERVER_PORT}/api/proxy`,
    baseURL: baseURL,
    withCredentials: true,
  });
};

let axiosInstance = createAxiosInstance();

// process.browser true; CSR, false: SSR
if (typeof window === 'undefined') {
  const { serverRuntimeConfig } = getConfig();
  const apiServer = serverRuntimeConfig.apiServer;
  axiosInstance = createAxiosInstance();
}

// Redux store의 상태 변경을 구독하여 accessToken 업데이트
// store.subscribe(() => {
//   const auth = store.getState().auth;
//   if (auth.auth) {
//     axiosInstance.defaults.headers['X-AUTH-TOKEN'] = auth.accessToken;
//     // } else {
//     //   delete axiosInstance.defaults.headers['X-AUTH-TOKEN'];
//   }
// });

// let isRefreshing = false;
// let requestQueue = [];
// const dispatch = getDispatch();
// const purge = async () => {
//   await persistor.purge();
// };
//
// // API 요청 Queue
// const processQueue = (error, token = null) => {
//   requestQueue.forEach((prom) => {
//     if (error) {
//       prom.reject(error);
//     } else {
//       prom.resolve(token);
//     }
//   });
//
//   requestQueue = [];
//   isRefreshing = false;
// };

axiosInstance.interceptors.request.use(
  (config) => {
    // console.log('Request Data:', config.data);
    // console.log('Request Headers:', config.headers);
    return config;
  },
  (error) => {
    console.error('API REQUEST ERR :: ', error);
    return Promise.reject(error);
  },
);

axiosInstance.interceptors.response.use(
  (config) => {
    // console.log('response Data:', config.data);
    // console.log('response Headers:', config.headers);
    return config;
  },
  async (response) => {
    const errorCode = response?.data?.errorCode;
    const originalRequest = response.config;

    // console.log('axiosConfig/ :95 - errorCode : ', errorCode, '/response = ', response);
    // if (errorCode === '2001' || errorCode === '2002') {
    //   // console.log(
    //   //   'axiosConfig/2001 || 2002 :95 - isRefreshing : ',
    //   //   isRefreshing,
    //   //   '/ originalRequest : ',
    //   //   originalRequest,
    //   // );
    //
    //   // if (!isRefreshing) {
    //   //   // 토큰 갱신중이 아닌 경우, isRefreshing = false 인 경우에만 token refresh 요청
    //   //   isRefreshing = true;
    //   //
    //   //   return await getRefreshAccessTokenApi()
    //   //     .then(async (res) => {
    //   //       if (res?.resultCode === 'SUCC') {
    //   //         const accessToken = res?.accessToken;
    //   //         isRefreshing = false; // 토큰 갱신 완료 후
    //   //         processQueue(null, accessToken); // 대기 중인 요청들을 처리하고 새로운 토큰으로 재시도
    //   //         originalRequest.headers['X-AUTH-TOKEN'] = accessToken;
    //   //         return axiosInstance(originalRequest);
    //   //       } else if (res?.errorCode === '2008' || res?.errorCode === '2002') {
    //   //         // Refresh Token 만료 시 requestQueue 비우기, logout; purge(), wsClose
    //   //         isRefreshing = false;
    //   //         requestQueue = [];
    //   //         await purge();
    //   //         return Promise.reject(response);
    //   //       } else {
    //   //         return Promise.reject(response);
    //   //       }
    //   //     })
    //   //     .catch((err) => {
    //   //       processQueue(err, null);
    //   //       return Promise.reject(err);
    //   //     });
    //   // }
    //
    //   // 2001 에러로 들어온 첫번째 이후 api
    //   return new Promise((resolve, reject) => {
    //     requestQueue.push({ resolve, reject });
    //   })
    //     .then((token) => {
    //       originalRequest.headers['X-AUTH-TOKEN'] = token;
    //       return axiosInstance(originalRequest);
    //     })
    //     .catch((err) => {
    //       return Promise.reject(err);
    //     });
    // } else if (errorCode === '0011') {
    //   // 권한 재조회 후 setAuth 에 바뀐 권한 집어넣기
    //   // const auth = store.getState().auth;
    //   // dispatch(fetchUserInfo(auth.userId));
    //   return await handleError(response);
    // } else {
    //   // console.log('axiosConfig/ :145 -isRefreshing : ', isRefreshing, '  / response = ', response);
    // }

    // console.log('axiosConfig/isRefreshing ------------------------------------------------');
    return response;
  },
  async (error) => {
    try {
      console.error('API RESPONSE ERR :: ', error);
      // commonUtil.showMessage('에러발생', 'error');

      return await Promise.reject({ ...error.response });
    } catch (e) {
      console.error('AXIOS RESPONSE ERR ::: ', e);
    }
  },
);

export default axiosInstance;
