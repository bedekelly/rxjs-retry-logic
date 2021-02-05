import './App.scss';
import React from "react";
import {of, throwError, timer} from "rxjs";
import {catchError, map, switchMap, switchMapTo, tap} from "rxjs/operators";


/**
 * Global state: in the real app, this is stored in cookies.
 */
let token = 'invalidToken';
const getToken = () => token;
const setToken = newToken => {
  console.log("Access token is now", newToken)
  token = newToken;
};
let refreshToken = 'validRefreshToken';
const setRefreshToken = (newToken) => {
  console.log("Refresh token is now", newToken)
  refreshToken = newToken
};


/**
 * Redirect to the SSO login screen.
 */
function redirectToSSO() {
  console.log("Navigating to SSO login page, using `window.location = ssoURL`");
}


/**
 * Utility function to take a Request and append the *latest* value of
 * the access token.
 */
function authenticateRequest(request) {
  return { ...request, authToken: getToken() };
}


/**
 * This is in the "service" layer, i.e. *.service.js.
 * It specifies the actual URL, the format of the parameters etc.
 */
function callSomeService$(params) {
  // 1. make an unauthenticated Request object
  const request = {
    url: 'https://example.com',
    method: 'POST',
    body: { params }
  };

  // 2. Return an observable which, when subscribed, will make this
  // request with up-to-date authentication.
  return authenticatedAPICall$(request);
}


/**
 * This is the bottom-layer function which calls RxJS's ajax$ factory.
 * Returns an observable which will push either 200 or 400 depending on auth.
 */
function makeAuthenticatedRequest$(authenticatedRequest) {
  const { url, method, body, authToken } = authenticatedRequest;
  return of(null).pipe(
    tap(() => console.log("Making a network request with", authenticatedRequest)),
    switchMap(() => timer(2000)),
    switchMapTo(authToken === 'validToken' ? of('200') : throwError('400'))
  );
}


/**
 * Attempt to refresh the auth token. This will also call RXJS's ajax$ factory
 * since we're doing an unauthenticated request to a non-ALPIMA domain.
 */
function refreshAuthToken() {
  return of(null).pipe(
    tap(() => console.log("Refreshing the auth token with refresh token:", refreshToken)),
    switchMap(() => timer(2000)),
    switchMapTo(refreshToken === 'validRefreshToken' ? of('validToken') : throwError('400')),
    tap(response => {
      setToken(response);
    })
  )
}


/**
 * If we catch an error and it's specifically a 400 error from our API,
 * try to refresh our auth token and then retry this observable.
 */
function handleOutdatedAccessToken(error, caught) {
  if (error === '400') return refreshAuthToken().pipe(switchMapTo(caught));
  else throw error;
}


/**
 * If we've caught a 400 error *again*, it's either a problem with our
 * *new* token, or we need a new refresh token. In these cases redirect
 * to our SSO page; otherwise just re-throw the error.
 */
function handleOutdatedRefreshToken(error) {
  if (error === '400') redirectToSSO();
  throw error;
}


/**
 * This is a utility function for service-layer functions to use.
 * 1. Add authentication to the request
 * 2. Try to perform the authenticated request
 * 3. If we get a 400, try using our refresh token.
 * 4. If we get a 400 *again*, redirect to SSO.
 */
function authenticatedAPICall$(unauthenticatedRequest) {
  return of(unauthenticatedRequest).pipe(
    map(authenticateRequest),
    switchMap(makeAuthenticatedRequest$),
    catchError(handleOutdatedAccessToken),
    catchError(handleOutdatedRefreshToken)
  )
}


export default function App() {

  /**
   * A callback function either defined in the component or used in an epic.
   */
  function doSomething() {
    const params = [1,2,3];
    const request$ = callSomeService$(params);
    request$.subscribe(
      value => console.log("Component got value:", value),
      error => console.warn("Component got error", error),
    );
  }

  return (
    <div className="buttons">
      <button onClick={() => {
        doSomething();
      }}>Make network request</button>

      <button onClick={() => {
        setToken('invalidToken');
      }}>Invalidate access token</button>

      <button onClick={() => {
        setRefreshToken('invalidRefreshToken')
      }}>Invalidate refresh token</button>

      <button onClick={() => {
        setRefreshToken('validRefreshToken')
      }}>Set refresh token as valid</button>
    </div>
  );
}
