// Dev-aware API base: when the Angular app runs on localhost (ng serve) it
// talks to the local Express backend; production builds keep the hosted URL.
function resolveApiBase(): string {
  try {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') {
      return 'http://localhost:5000/';
    }
  } catch (e) { /* SSR guard */ }
  return 'https://tedbus-958t.onrender.com/';
}

export const url: string = resolveApiBase();
export const googleMapsApiKey: string = 'AIzaSyD137fp6DkDJOKYXic2tZKTvjnILdHQr_U';
