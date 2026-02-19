import { AppSettings, TaskItem } from '../types';

export interface GithubAuthenticatedUser {
    id: number;
    login: string;
    avatar_url?: string;
    name?: string;
    email?: string;
}

export interface GithubRepository {
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
    owner: {
        login: string;
    };
}

export interface GithubBranch {
    name: string;
}

export interface GithubPullRequestDetails {
    number: number;
    html_url: string;
    title: string;
    state: 'open' | 'closed';
    mergeable: boolean | null;
    mergeable_state?: string;
    head: {
        ref: string;
        sha: string;
    };
    base: {
        ref: string;
        sha: string;
    };
}

export interface TokenValidationResult {
    valid: boolean;
    user?: GithubAuthenticatedUser;
    scopes: string[];
    hasRequiredScopes: boolean;
    missingScopes: string[];
    error?: string;
}

const getGithubToken = (settings: AppSettings): string => {
    const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env;
    return settings.githubToken || env?.VITE_GITHUB_TOKEN || env?.GITHUB_TOKEN || '';
};

const getHeaders = (token: string) => ({
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
});

const getRepoReadHeaders = (token: string) => ({
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
});

const handleGithubError = async (response: Response, context: string) => {
    let errorMessage = response.statusText;
    let errorDetails = '';
    
    try {
        const errorBody = await response.json();
        errorMessage = errorBody.message || errorMessage;
        if (errorBody.errors) {
            errorDetails = errorBody.errors.map((e: any) => 
                e.message ? e.message : `Code: ${e.code} Resource: ${e.resource}`
            ).join(', ');
        }
    } catch {}

    const fullMessage = errorDetails ? `${errorMessage} (${errorDetails})` : errorMessage;

    if (response.status === 403) {
        if (response.headers.get('x-ratelimit-remaining') === '0') {
            throw new Error(`GitHub API Rate Limit Exceeded. Reset at ${new Date(Number(response.headers.get('x-ratelimit-reset')) * 1000).toLocaleTimeString()}.`);
        }
        throw new Error(`Permission denied (403) during ${context}. GitHub says: "${fullMessage}". Ensure your Token has the correct scopes.`);
    }

    if (response.status === 404) {
        throw new Error(`Resource not found (404) during ${context}. GitHub says: "${fullMessage}". Check repository owner, name, and permissions.`);
    }

    if (response.status === 422) {
        throw new Error(`Validation Failed (422) during ${context}. GitHub says: "${fullMessage}"`);
    }

    // 405 is often handled specifically in calling functions, but if it reaches here:
    if (response.status === 405) {
        throw new Error(`Method Not Allowed (405) during ${context}. The operation is not supported or the resource is in a state that prevents it (e.g. Merge Conflicts). GitHub says: "${fullMessage}"`);
    }

    throw new Error(`GitHub API Error (${response.status}) during ${context}: ${fullMessage}`);
};

/**
 * Parse GitHub OAuth scopes from response headers
 */
const parseScopes = (scopeHeader: string | null): string[] => {
    if (!scopeHeader) return [];
    return scopeHeader.split(',').map(s => s.trim()).filter(Boolean);
};

/**
 * Required scopes for the application to function properly
 */
const REQUIRED_SCOPES = {
    classic: ['repo'], // Classic tokens need 'repo' scope
    fineGrained: ['contents', 'pull_requests', 'issues'] // Fine-grained tokens need these
};

/**
 * Validate a GitHub token and check its scopes
 */
export const validateGithubToken = async (token: string): Promise<TokenValidationResult> => {
    if (!token || !token.trim()) {
        return {
            valid: false,
            scopes: [],
            hasRequiredScopes: false,
            missingScopes: [],
            error: 'Token is empty'
        };
    }

    try {
        const response = await fetch('https://api.github.com/user', {
            headers: {
                'Authorization': `token ${token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) {
            if (response.status === 401) {
                return {
                    valid: false,
                    scopes: [],
                    hasRequiredScopes: false,
                    missingScopes: [],
                    error: 'Invalid token or token has been revoked'
                };
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const user = await response.json() as GithubAuthenticatedUser;
        const scopeHeader = response.headers.get('x-oauth-scopes');
        const scopes = parseScopes(scopeHeader);

        // Check if token has required scopes
        // Classic tokens will have 'repo' scope
        // Fine-grained tokens won't show in x-oauth-scopes header (limitation of GitHub API)
        const hasClassicRepo = scopes.includes('repo');
        const hasRequiredScopes = hasClassicRepo || scopes.length === 0; // Empty scopes likely means fine-grained
        
        let missingScopes: string[] = [];
        if (!hasRequiredScopes && scopes.length > 0) {
            // Classic token without repo scope
            missingScopes = REQUIRED_SCOPES.classic.filter(s => !scopes.includes(s));
        }

        return {
            valid: true,
            user,
            scopes,
            hasRequiredScopes,
            missingScopes
        };
    } catch (error) {
        return {
            valid: false,
            scopes: [],
            hasRequiredScopes: false,
            missingScopes: [],
            error: error instanceof Error ? error.message : String(error)
        };
    }
};


export const createGithubIssue = async (settings: AppSettings, task: TaskItem) => {
    const token = getGithubToken(settings);
    if (!token) throw new Error("GitHub Token not configured");

    const response = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/issues`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
            title: task.title,
            body: `${task.description}\n\n**Group:** ${task.group}\n**Priority:** ${task.priority}\n\n*Generated by Flowize*`,
            labels: [task.group, `Priority: ${task.priority}`]
        })
    });

    if (!response.ok) {
        await handleGithubError(response, 'Create Issue');
    }

    return response.json();
};

export const fetchGithubIssues = async (settings: AppSettings): Promise<any[]> => {
    const token = getGithubToken(settings);
    if (!token) throw new Error("GitHub Token not configured");

    const response = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/issues?state=open`, {
        method: 'GET',
        headers: getHeaders(token)
    });

    if (!response.ok) {
        await handleGithubError(response, 'Fetch Issues');
    }

    return response.json();
};

// --- New Methods for PR Workflow ---

export const getBSHA = async (settings: AppSettings, branch: string = 'main') => {
    const token = getGithubToken(settings);
    if (!token) throw new Error("GitHub Token not configured");
    
    const url = `https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/git/ref/heads/${branch}`;
    const headers = getHeaders(token);

    let response = await fetch(url, { headers });

    // Handle Empty Repository (409) by initializing it
    if (response.status === 409) {
         console.warn("Repository appears empty (409). Attempting to initialize with README.md...");
         try {
             // Create a README to initialize the repo
             const initResponse = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/contents/README.md`, {
                method: 'PUT',
                headers,
                body: JSON.stringify({
                    message: 'Initialize repository with README',
                    content: btoa(`# ${settings.repoName}\n\nInitialized by Flowize`),
                    branch // Initialize specifically on the requested default branch
                })
             });
             
             if (initResponse.ok) {
                 // Retry fetching the ref after initialization
                 response = await fetch(url, { headers });
             }
         } catch (e) {
             console.error("Failed to auto-initialize", e);
             // Fall through to standard error handling if init fails
         }
    }

    // Fallback: If 'main' not found (404), try 'master'
    if (!response.ok && branch === 'main' && response.status === 404) {
        console.warn("Branch 'main' not found, attempting fallback to 'master'");
        const fallbackResponse = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/git/ref/heads/master`, { headers });
        if (fallbackResponse.ok) {
            response = fallbackResponse;
        }
    }

    if (!response.ok) {
        await handleGithubError(response, `Get Branch SHA (${branch})`);
    }
    
    const data = await response.json();
    return data.object.sha;
};

export const createBranch = async (settings: AppSettings, newBranch: string, baseSha: string) => {
    const token = getGithubToken(settings);
    if (!token) throw new Error("GitHub Token not configured");

    // Check if exists first
    const check = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/git/ref/heads/${newBranch}`, {
         headers: getHeaders(token)
    });
    if (check.ok) return; // Branch exists, skip creation

    const response = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/git/refs`, {
        method: 'POST',
        headers: getHeaders(token),
        body: JSON.stringify({
            ref: `refs/heads/${newBranch}`,
            sha: baseSha
        })
    });
    
    if (!response.ok) {
         await handleGithubError(response, `Create Branch ${newBranch}`);
    }
};

export const commitFile = async (settings: AppSettings, branch: string, path: string, content: string, message: string) => {
    const token = getGithubToken(settings);
    if (!token) throw new Error("GitHub Token not configured");

    const headers = getHeaders(token);

    // 1. Check if file exists to get SHA (for update) or null (for create)
    let sha: string | undefined;
    const check = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/contents/${path}?ref=${branch}`, {
        headers
    });
    
    if (check.ok) {
        const data = await check.json();
        sha = data.sha;
    } else if (check.status !== 404) {
        // If it's not 404, it's a real error (e.g. 403 forbidden on read)
        await handleGithubError(check, `Check File Existence ${path}`);
    }

    // 2. Create/Update file
    const response = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/contents/${path}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
            message,
            content: btoa(unescape(encodeURIComponent(content))), // Handle unicode
            branch,
            sha
        })
    });
    
    if (!response.ok) {
        await handleGithubError(response, `Commit File ${path}`);
    }
};

export const createPullRequest = async (settings: AppSettings, head: string, base: string, title: string, body: string) => {
    const token = getGithubToken(settings);
    if (!token) throw new Error("GitHub Token not configured");

    const makeRequest = async (headParam: string, baseParam: string) => {
        return fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/pulls`, {
            method: 'POST',
            headers: getHeaders(token),
            body: JSON.stringify({
                title,
                body,
                head: headParam,
                base: baseParam
            })
        });
    };

    let response = await makeRequest(head, base);
    
    // Error handling & Fallback Strategies
    if (response.status === 422) {
        const clonedRes = response.clone();
        
        // --- 1. Aggressive Existing PR Check ---
        try {
             const cleanHead = head.includes(':') ? head.split(':')[1] : head;
             const queryHead = `${settings.repoOwner}:${cleanHead}`;
             
             console.log(`Checking for existing PRs for ${queryHead}...`);
             const prsResponse = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/pulls?head=${queryHead}&state=open`, {
                  headers: getHeaders(token)
             });
             
             if (prsResponse.ok) {
                 const prs = await prsResponse.json();
                 if (prs.length > 0) {
                     console.log("Found existing PR:", prs[0].html_url);
                     return prs[0];
                 }
             }
        } catch (e) {
            console.warn("Failed to check for existing PRs", e);
        }

        // --- 2. Diagnostic Checks for Other 422 Errors ---
        const headRef = head.includes(':') ? head.split(':')[1] : head;
        const headCheck = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/git/ref/heads/${headRef}`, {
            headers: getHeaders(token)
        });
        
        if (headCheck.status === 404) {
            throw new Error(`Cannot create PR: The head branch '${headRef}' does not exist on GitHub.`);
        }

        if (headCheck.ok) {
            try {
                const headData = await headCheck.json();
                const baseSha = await getBSHA(settings, base);
                if (headData.object.sha === baseSha) {
                     throw new Error(`Cannot create PR: The head branch '${headRef}' is identical to the base branch '${base}'.`);
                }
            } catch (e) { console.warn("Diagnostic check failed", e); }
        }

        // --- 3. Retry Logic ---
        let alternateBase = '';
        if (base === 'main') alternateBase = 'master';
        else if (base === 'master') alternateBase = 'main';
        
        if (alternateBase) {
            const retryResponse = await makeRequest(head, alternateBase);
            if (retryResponse.ok) {
                return retryResponse.json();
            }
        }

        if (!head.includes(':')) {
             const namespacedHead = `${settings.repoOwner}:${head}`;
             const retryResponse = await makeRequest(namespacedHead, base);
             if (retryResponse.ok) {
                 return retryResponse.json();
             }
             if (alternateBase) {
                 const retryResponse2 = await makeRequest(namespacedHead, alternateBase);
                 if (retryResponse2.ok) {
                     return retryResponse2.json();
                 }
             }
        }
    }

    if (!response.ok) {
        await handleGithubError(response, 'Create Pull Request');
    }
    return response.json();
};

export const mergePullRequest = async (settings: AppSettings, prNumber: number, title?: string) => {
    const token = getGithubToken(settings);
    if (!token) throw new Error("GitHub Token not configured");

    const makeMergeCall = async () => {
        return fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/pulls/${prNumber}/merge`, {
            method: 'PUT',
            headers: getHeaders(token),
            body: JSON.stringify({
                commit_title: title,
                merge_method: 'squash'
            })
        });
    };

    let response = await makeMergeCall();

    if (response.status === 405) {
        console.warn("Merge failed (405). Attempting to sync branch...");
        
        const updateResponse = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/pulls/${prNumber}/update-branch`, {
             method: 'PUT',
              headers: getHeaders(token)
        });

        if (updateResponse.ok) {
            console.log("Branch update triggered. Waiting for synchronization...");
            await new Promise(r => setTimeout(r, 2000));
            response = await makeMergeCall();
        } else {
            console.error("Failed to auto-update branch", updateResponse.statusText);
            try {
                const err = await updateResponse.json();
                throw new Error(`Merge Failed: The PR is not mergeable and auto-update failed: ${err.message}`);
            } catch (e: any) {
                if (e.message.startsWith("Merge Failed")) throw e;
            }
        }
    }

    if (!response.ok) {
        await handleGithubError(response, 'Merge Pull Request');
    }

    return response.json();
};

export const fetchMergedPRs = async (settings: AppSettings): Promise<any[]> => {
    const token = getGithubToken(settings);
    if (!token) throw new Error("GitHub Token not configured");

    const response = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/pulls?state=closed&sort=updated&direction=desc`, {
        method: 'GET',
        headers: getHeaders(token)
    });

    if (!response.ok) {
        await handleGithubError(response, 'Fetch Merged PRs');
    }

    const data = await response.json();
    return data.filter((pr: any) => pr.merged_at !== null);
};

export const fetchOpenPRs = async (settings: AppSettings): Promise<any[]> => {
    const token = getGithubToken(settings);
    if (!token) throw new Error("GitHub Token not configured");

    const response = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/pulls?state=open&sort=updated&direction=desc`, {
        method: 'GET',
        headers: getHeaders(token)
    });

    if (!response.ok) {
        await handleGithubError(response, 'Fetch Open PRs');
    }

    return response.json();
};

export const fetchPullRequestDetails = async (settings: AppSettings, prNumber: number): Promise<GithubPullRequestDetails> => {
    const token = getGithubToken(settings);
    if (!token) throw new Error('GitHub Token not configured');

    const response = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/pulls/${prNumber}`, {
        method: 'GET',
        headers: getHeaders(token)
    });

    if (!response.ok) {
        await handleGithubError(response, `Fetch Pull Request (${prNumber})`);
    }

    return response.json();
};

export const fetchCommitStatus = async (settings: AppSettings, ref: string) => {
    const token = getGithubToken(settings);
    if (!token) throw new Error("GitHub Token not configured");

    const response = await fetch(`https://api.github.com/repos/${settings.repoOwner}/${settings.repoName}/commits/${ref}/status`, {
        method: 'GET',
        headers: getHeaders(token)
    });

    if (!response.ok) {
        if (response.status === 404) return { state: 'pending', statuses: [] };
        await handleGithubError(response, `Fetch Commit Status (${ref})`);
    }

    return response.json();
};

export const fetchAuthenticatedUser = async (token: string): Promise<GithubAuthenticatedUser> => {
    const safeToken = token.trim();
    if (!safeToken) throw new Error('GitHub Token not configured');

    const response = await fetch('https://api.github.com/user', {
        method: 'GET',
        headers: getRepoReadHeaders(safeToken)
    });

    if (!response.ok) {
        await handleGithubError(response, 'Fetch Authenticated User');
    }

    return response.json();
};

export const fetchUserRepositories = async (token: string): Promise<GithubRepository[]> => {
    const safeToken = token.trim();
    if (!safeToken) throw new Error('GitHub Token not configured');

    const response = await fetch('https://api.github.com/user/repos?sort=updated&direction=desc&per_page=100', {
        method: 'GET',
        headers: getRepoReadHeaders(safeToken)
    });

    if (!response.ok) {
        await handleGithubError(response, 'Fetch User Repositories');
    }

    return response.json();
};

export const fetchRepositoryBranches = async (token: string, owner: string, repo: string): Promise<GithubBranch[]> => {
    const safeToken = token.trim();
    if (!safeToken) throw new Error('GitHub Token not configured');
    if (!owner.trim() || !repo.trim()) throw new Error('Repository owner/name missing');

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches?per_page=100`, {
        method: 'GET',
        headers: getRepoReadHeaders(safeToken)
    });

    if (!response.ok) {
        await handleGithubError(response, `Fetch Repository Branches (${owner}/${repo})`);
    }

    return response.json();
};
