import { useState } from "react";
import PasswordInput from "../../../components/PasswordInput";

export default function LoginForm({onSubmit, error, loading}) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

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
                <PasswordInput
                    id="login-password"
                    name="password"
                    autoComplete="current-password"
                    placeholder="Saisissez votre mot de passe"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                />
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
