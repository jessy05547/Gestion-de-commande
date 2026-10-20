import { useState } from "react";
import PasswordInput from "../../../components/PasswordInput";

export default function RegisterForm({ onSubmit, error, loading }) {
    const [nomUtilisateur, setNomUtilisateur] = useState("");
    const [prenomUtilisateur, setPrenomUtilisateur] = useState("");
    const [email, setEmail] = useState("");
    const [telephone, setTelephone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [passwordError, setPasswordError] = useState(null);
    const passwordRequirements = [
        { label: "Au moins 8 caractères", valid: password.length >= 8 },
        { label: "Ne pas être composé uniquement de chiffres", valid: password.length > 0 && !/^\d+$/.test(password) },
    ];

    const handleSubmit = (event) => {
        event.preventDefault();
        setPasswordError(null);

        if (password !== confirmPassword) {
            setPasswordError("Les mots de passe ne correspondent pas.");
            return;
        }

        onSubmit({
            nomUtilisateur: nomUtilisateur.trim(),
            prenomUtilisateur: prenomUtilisateur.trim(),
            email: email.trim().toLowerCase(),
            telephone: telephone.trim(),
            password,
        });

    };

    return (
        <form className="login-form register-form" onSubmit={handleSubmit}>
            <div className="login-field">
                <label htmlFor="register-last-name">Nom</label>
                <input
                    id="register-last-name"
                    name="nomUtilisateur"
                    type="text"
                    autoComplete="family-name"
                    maxLength={255}
                    placeholder="Votre nom"
                    value={nomUtilisateur}
                    onChange={(event) => setNomUtilisateur(event.target.value)}
                    required
                />
            </div>
            <div className="login-field">
                <label htmlFor="register-first-name">Prénom</label>
                <input
                    id="register-first-name"
                    name="prenomUtilisateur"
                    type="text"
                    autoComplete="given-name"
                    maxLength={255}
                    placeholder="Votre prénom"
                    value={prenomUtilisateur}
                    onChange={(event) => setPrenomUtilisateur(event.target.value)}
                    required
                />
            </div>
            <div className="login-field">
                <label htmlFor="register-email">Adresse e-mail</label>
                <input
                    id="register-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    placeholder="exemple@domaine.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                />
            </div>
            <div className="login-field">
                <label htmlFor="register-phone">Téléphone <span>(facultatif)</span></label>
                <input
                    id="register-phone"
                    name="telephone"
                    type="tel"
                    autoComplete="tel"
                    maxLength={20}
                    placeholder="Votre numéro de téléphone"
                    value={telephone}
                    onChange={(event) => setTelephone(event.target.value)}
                />
            </div>
            <div className="login-field">
                <label htmlFor="register-password">Mot de passe</label>
                <PasswordInput
                    id="register-password"
                    name="password"
                    autoComplete="new-password"
                    placeholder="8 caractères minimum"
                    minLength={8}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                />
                <p className="password-requirements-note">
                    Le mot de passe ne doit pas être courant ni trop proche de vos informations
                    personnelles.
                </p>
                <ul className="password-requirements" aria-label="Conditions du mot de passe">
                    {passwordRequirements.map(({ label, valid }) => (
                        <li
                            className={valid ? "is-valid" : "is-invalid"}
                            aria-label={`${label} : ${valid ? "validé" : "non validé"}`}
                            key={label}
                        >
                            <span aria-hidden="true">{valid ? "✓" : "×"}</span>
                            {label}
                        </li>
                    ))}
                </ul>
            </div>
            <div className="login-field">
                <label htmlFor="register-confirm-password">Confirmer le mot de passe</label>
                <PasswordInput
                    id="register-confirm-password"
                    name="confirmPassword"
                    autoComplete="new-password"
                    placeholder="Saisissez à nouveau le mot de passe"
                    minLength={8}
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    required
                />
            </div>
            {(passwordError || error) && (
                <div className="register-error" role="alert">
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
                    <span>{passwordError || error}</span>
                </div>
            )}
            <button className="login-submit" type="submit" disabled={loading}>
                <span>{loading ? "Création du compte…" : "Créer mon compte"}</span>
            </button>
        </form>
    );
}
