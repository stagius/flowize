import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
    isAuthenticated: boolean;
    token: string | null;
    login: (token: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
    const [token, setToken] = useState<string | null>(initialToken || null);
    const [isAuthenticated, setIsAuthenticated] = useState<boolean>(Boolean(initialToken));

    useEffect(() => {
        setIsAuthenticated(Boolean(token));
    }, [token]);

    const login = (newToken: string) => {
        setToken(newToken);
        setIsAuthenticated(true);
        onLoginSuccess?.(newToken);
    };

    const logout = () => {
        setToken(null);
        setIsAuthenticated(false);
        onLogout?.();
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, token, login, logout }}>
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
