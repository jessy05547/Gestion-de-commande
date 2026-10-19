import { useState } from "react";
import { Link } from "react-router-dom";
import { register, verifyRegistration } from "../../../api/auth.api";
import RegisterForm from "../components/RegisterForm";
import VerificationForm from "../components/VerificationForm";
import "../styles/auth.css";

function getRegistrationError(error) {
    if (!error.response) {
        return "Impossible de joindre le serveur. Vérifiez que l'API Django est démarrée.";
    }

    if (error.response.status === 404) {
        return "Le service d'inscription est introuvable. Vérifiez que l'API Django est démarrée avec la bonne configuration.";
    }

    const responseData = error.response?.data;
    const message = findErrorMessage(responseData);
    if (message) return message;

    return "La création du compte a échoué. Veuillez réessayer.";
}

function findErrorMessage(value) {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
        return value.map(findErrorMessage).find(Boolean);
    }
    if (value && typeof value === "object") {
        return Object.values(value).map(findErrorMessage).find(Boolean);
    }
    return null;
}

export default function RegisterPage() {
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    const [registered, setRegistered] = useState(false);
    const [verificationEmail, setVerificationEmail] = useState("");
    const [verificationCode, setVerificationCode] = useState("");
    const [verificationStep, setVerificationStep] = useState(false);

    const handleRegister = async (userData) => {
        setLoading(true);
        setError(null);
        try {
            await register(userData);
            setVerificationEmail(userData.email);
            setVerificationCode("");
            setVerificationStep(true);
        } catch (requestError) {
            setError(getRegistrationError(requestError));
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (verificationData) => {
        setLoading(true);
        setError(null);
        try {
            await verifyRegistration(verificationData);
            setRegistered(true);
        } catch (requestError) {
            setError(getRegistrationError(requestError));
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="login-page register-page">
            <section className="login-card register-card" aria-labelledby="register-title">
                <div className="login-heading register-heading">
                    <p className="login-eyebrow">GESTION DE COMMANDE</p>
                    <h1 id="register-title">
                        {registered ? "Bienvenue !" : verificationStep ? "Vérifiez votre e-mail" : <>Créez votre<br />compte</>}
                    </h1>
                    <p className="login-intro">
                        {registered
                            ? "Votre compte a été créé avec succès. Vous pouvez maintenant vous connecter."
                            : verificationStep
                                ? `Un code à 6 chiffres a été envoyé à ${verificationEmail}. Il est valable 10 minutes.`
                                : "Rejoignez-nous en quelques instants."}
                    </p>
                </div>
                {registered ? (
                    <p className="login-signup register-success" role="status">
                        <Link to="/login">Se connecter à mon compte</Link>
                    </p>
                ) : verificationStep ? (
                    <VerificationForm
                        email={verificationEmail}
                        code={verificationCode}
                        setCode={setVerificationCode}
                        onSubmit={handleVerify}
                        onBack={() => {
                            setVerificationStep(false);
                            setError(null);
                        }}
                        error={error}
                        loading={loading}
                    />
                ) : (
                    <>
                        <RegisterForm
                            onSubmit={handleRegister}
                            error={error}
                            loading={loading}
                        />
                        <p className="login-signup register-footer">
                            Vous avez déjà un compte ? <Link to="/login">Se connecter</Link>
                        </p>
                    </>
                )}
            </section>
        </main>
    );
}
