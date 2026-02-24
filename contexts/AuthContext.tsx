import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { encrypt, decrypt, isEncrypted } from '../utils/crypto';

type LoginMode = 'oauth' | 'manual';

interface AuthContextType {
    isAuthenticated: boolean;
    token: string | null;
    loginMode: LoginMode;
    login: (token: string, mode?: LoginMode) => Promise<void>;
    logout: () => void;
    setLoginMode: (mode: LoginMode) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'flowize.auth.token.v1';
const LOGIN_MODE_STORAGE_KEY = 'flowize.auth.mode.v1';

interface AuthProviderProps {
    children: ReactNode;
    initialToken?: string;
    onLoginSuccess?: (token: string) => void;
    onLogout?: () => void;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ 
    children, 
    initialToken = '',
    onLoginSuccess,
    onLogout
}) => {
    const [token, setToken] = useState<string | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
    const [loginMode, setLoginModeState] = useState<LoginMode>(() => {
        // Load saved login mode preference
        if (typeof window === 'undefined') return 'oauth';
        try {
            const saved = window.localStorage.getItem(LOGIN_MODE_STORAGE_KEY);
            return (saved === 'manual' || saved === 'oauth') ? saved : 'oauth';
        } catch {
            return 'oauth';
        }
    });
    const [isInitialized, setIsInitialized] = useState(false);
    // Track whether the one-time initialization has run so that subsequent
    // changes to `initialToken` (e.g. when App.setSettings updates the token
    // after login) don't re-trigger the full async init and cause a white screen.
    const hasInitialized = useRef(false);

    // Initialize auth exactly once on mount, using the initial token value
    // captured in a ref so the effect dependency array stays empty ([]).
    const initialTokenRef = useRef(initialToken);

    useEffect(() => {
        if (hasInitialized.current) return;
        hasInitialized.current = true;

        const initializeAuth = async () => {
            const startToken = initialTokenRef.current;

            if (startToken) {
                // Use initial token if provided (from settings)
                setToken(startToken);
                setIsAuthenticated(true);
                setIsInitialized(true);
                return;
            }

            // Try to load encrypted token from storage
            if (typeof window === 'undefined') {
                setIsInitialized(true);
                return;
            }

            try {
                const storedToken = window.localStorage.getItem(TOKEN_STORAGE_KEY);
                if (storedToken) {
                    // Check if it's encrypted
                    if (isEncrypted(storedToken)) {
                        try {
                            const decryptedToken = await decrypt(storedToken);
                            setToken(decryptedToken);
                            setIsAuthenticated(true);
                        } catch (error) {
                            console.error('Failed to decrypt stored token:', error);
                            // Clear invalid encrypted token
                            window.localStorage.removeItem(TOKEN_STORAGE_KEY);
                        }
                    } else {
                        // Plain token (legacy support)
                        setToken(storedToken);
                        setIsAuthenticated(true);
                    }
                }
            } catch (error) {
                console.error('Failed to load token from storage:', error);
            } finally {
                // Always mark as initialized so the spinner never hangs indefinitely
                // (e.g. if crypto.subtle is unavailable in a non-secure context)
                setIsInitialized(true);
            }
        };

        void initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // When the parent passes a new initialToken after initialization (e.g. after
    // a successful login that calls App.handleLoginSuccess → setSettings), sync
    // the token into context state without re-running the full init flow.
    useEffect(() => {
        if (!hasInitialized.current) return;
        if (initialToken) {
            setToken(initialToken);
            setIsAuthenticated(true);
        }
    }, [initialToken]);

    const login = async (newToken: string, mode: LoginMode = 'oauth') => {
        setToken(newToken);
        setIsAuthenticated(true);
        
        // Encrypt and store token
        if (typeof window !== 'undefined') {
            try {
                const encryptedToken = await encrypt(newToken);
                window.localStorage.setItem(TOKEN_STORAGE_KEY, encryptedToken);
            } catch (error) {
                console.error('Failed to encrypt token, storing in plain text:', error);
                // Fallback to plain storage if encryption fails
                window.localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
            }
        }

        // Save login mode preference
        setLoginModeState(mode);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(LOGIN_MODE_STORAGE_KEY, mode);
        }

        onLoginSuccess?.(newToken);
    };

    const logout = () => {
        setToken(null);
        setIsAuthenticated(false);
        
        // Clear stored token and login mode
        if (typeof window !== 'undefined') {
            window.localStorage.removeItem(TOKEN_STORAGE_KEY);
            window.localStorage.removeItem(LOGIN_MODE_STORAGE_KEY);
        }
        
        onLogout?.();
    };

    const setLoginMode = (mode: LoginMode) => {
        setLoginModeState(mode);
        if (typeof window !== 'undefined') {
            window.localStorage.setItem(LOGIN_MODE_STORAGE_KEY, mode);
        }
    };

    // Don't render children until auth is initialized to avoid flash of wrong content.
    // Show a minimal spinner instead of null so the screen is never blank white.
    if (!isInitialized) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
                <div className="w-8 h-8 rounded-full border-2 border-slate-200 dark:border-slate-700 border-t-indigo-500 animate-spin" aria-label="Loading..." role="status" />
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ isAuthenticated, token, loginMode, login, logout, setLoginMode }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
