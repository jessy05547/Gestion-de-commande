import { useState } from "react";

export default function LoginForm({onSubmit, error, loading}) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit({email: email.trim().toLowerCase(), password});
    };

    return (
        <form className="login-form" onSubmit={handleSubmit}>
            <div className="login-field">
                <label htmlFor="login-email">Adresse e-mail</label>
                <input
                    id="login-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder="exemple@domaine.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                />
            </div>
            <div className="login-field">
                <label htmlFor="login-password">Mot de passe</label>
                <div className="password-input-wrap">
                    <input
                        id="login-password"
                        type={showPassword ? 'text' : 'password'}
                        name="password"
                        autoComplete="current-password"
                        placeholder="Saisissez votre mot de passe"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                    <button
                        className="password-visibility-toggle"
                        type="button"
                        aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                        aria-pressed={showPassword}
                        onClick={() => setShowPassword((visible) => !visible)}
                    >
                        {showPassword ? (
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                                <path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.2 0 9 4.7 10 7-.4.9-1.5 2.5-3.2 3.9M6.2 6.2C3.9 7.7 2.5 10 2 12c1 2.3 4.8 7 10 7 1 0 2-.2 2.9-.5" />
                            </svg>
                        ) : (
                            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                                <circle cx="12" cy="12" r="2.5" />
                            </svg>
                        )}
                    </button>
                </div>
            </div>
            {error && (
                <div className="login-error" role="alert">
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        fill="none"
                        focusable="false"
                    >
                        <path
                            d="M12 3.75 21 20.25H3L12 3.75Z"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinejoin="round"
                        />
                        <path
                            d="M12 9v5m0 2.5v.01"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                        />
                    </svg>
                    <span>{error}</span>
                </div>
            )}
            <button className="login-submit" type="submit" disabled={loading}>
                <span>{loading ? 'Connexion en cours…' : 'Se connecter'}</span>
            </button>
        </form>
    );
}
