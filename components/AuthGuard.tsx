import React, { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LoginPage } from './LoginPage';

interface AuthGuardProps {
    children: ReactNode;
    bridgeEndpoint: string;
    toasts?: ReactNode;
}

/**
 * AuthGuard - Middleware component to protect application routes
 * 
 * This component verifies the user's authentication status and redirects
 * unauthorized requests to the login page. It acts as a security layer
 * protecting all application routes.
 * 
 * Usage:
 * <AuthGuard bridgeEndpoint={endpoint}>
 *   <ProtectedContent />
 * </AuthGuard>
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({ 
    children, 
    bridgeEndpoint,
    toasts 
}) => {
    const { isAuthenticated, login } = useAuth();

    // Redirect to login page if user is not authenticated
    if (!isAuthenticated) {
        return (
            <>
                <LoginPage 
                    onLoginSuccess={login}
                    bridgeEndpoint={bridgeEndpoint}
                />
                {toasts}
            </>
        );
    }

    // User is authenticated - render protected content
    return <>{children}</>;
};
