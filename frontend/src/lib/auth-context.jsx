import {
    createContext, useCallback, useContext, useEffect, useMemo, useState
} from 'react'

import { onUnauthorized, tokenStore } from "@/lib/api"
import { authApi } from '@/lib/auth'


const AuthContext = createContext(null)

// /users/me returns 403 for deactivated/deleted accounts. The message is the
// only discriminator, so match substrings — not exact sentences.
function classifyBlockedAccount(message = "") {
  const text = message.toLowerCase()
  if (text.includes("pending deletion")) return "pending_deleted"
  if (text.includes("deactivated")) return "deactivated"
  if (text.includes("recovery period has expired")) return "recovery_expired"
  return "error"
}

export function AuthProvider({ children }){
    // status: loading | anonymous | active | deactivated | pending_deleted | recovery_expired | error
    const [state, setState] = useState({ status: "loading", user: null, error: null })

    const bootstrap = useCallback(async () => {
        if (!tokenStore.get()) {
            setState({ status: "anonymous", user: null, error: null })
            return
        }

        // reset the status to loading, for making checks from start
        setState((prev) => ({ ...prev, status: "loading" }))

        try {
            const user = await authApi.me()
            setState({ status: "active", user: user, error: null })
        } catch (err) {

            // if token is expired: request() already cleared the token and the
            // onUnauthorized subscription already set status "anonymous" with a
            // friendly message. Returning here keeps that state instead of
            // overwriting it (and avoids falling into the generic error branch).
            if (err.status === 401) {
                return
            }

            // checking whether "blocked user" or not by testing against active_users_only endpoint
            if (err.status === 403) {
                setState({ status: classifyBlockedAccount(err.message), user: null, error: err.message })
                return
            }

            // if unexpected err
            setState({ status: "error", user: null, error: err.message })
        }
    }, [])

    const login = useCallback(async (credentials) => {

        // user(i.e. userprofile) can remain as it is before login, but status must be reset
        setState((prev) => ({ ...prev, status: "loading", error: null }))

        try{
            await authApi.login(credentials)
        } catch(err) {
            setState({ status: "anonymous", user: null, error: err.message })
            throw err // let the ui know the err
        }

        // check the status or state of user after sucessful login
        await bootstrap()
    }, [bootstrap])

    const register = useCallback(async (input) => {
        setState((prev) => ({ ...prev, status: "loading", user: null, error: null }))

        try{
            await authApi.register(input)
        } catch(err){
            setState({ status: "anonymous", user: null, error: err.message })
            throw err // let the ui know the err
        }

        await login({ username: input.username, password: input.password })
    }, [login])

    const logout = useCallback(() => {
        authApi.logout() // it just removes token from localstorage
        setState({ status: "anonymous", user: null, error: null })
    }, [])

    const activate = useCallback(async () => {
        try{
            await authApi.activate()
        } catch(err){
            setState((prev) => ({ ...prev, error: err.message }))
            return // do not bootstrap: it would overwrite this error with the same 403
        }
        await bootstrap()
    }, [bootstrap])

    const recover = useCallback(async () => {
        try{
            await authApi.recover()
        } catch(err){
            setState((prev) => ({ ...prev, error: err.message }))
            return // same reason as activate
        }
        await bootstrap()
    }, [bootstrap])

    // Any 401 from any component drops the whole app to "anonymous" once.
    // onUnauthorized() REGISTERS the handler and returns the unregister fn,
    // which is why this arrow returns it and React uses it as cleanup.
    useEffect(() => onUnauthorized((err) => {
        setState({ status: "anonymous", user: null, error: err.message })
    }), [])

    // runs for the first render to update the state
    useEffect(() => { bootstrap() }, [bootstrap])

    // Keep the context value reference stable between renders, otherwise every
    // useAuth() consumer re-renders whenever the provider re-renders.
    // The object stores function REFERENCES (login, register, ...), not their
    // return values — useMemo never calls them.
    const value = useMemo(() => ({
        ...state, login, register, logout, activate, recover, refresh: bootstrap }),
        [state, login, register, logout, activate, recover, bootstrap],
    )

    //modern way of using provider (React 19 allows <Context> instead of <Context.Provider>)
    return  <AuthContext value={value}> { children } </AuthContext>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used inside <AuthProvider>")
  return context
}
