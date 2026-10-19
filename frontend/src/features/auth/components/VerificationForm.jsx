export default function VerificationForm({ email, code, setCode, onSubmit, onBack, error, loading }) {
    const handleSubmit = (event) => {
        event.preventDefault();
        onSubmit({ email, code: code.trim() });
    };

    return (
        <form className="login-form register-form" onSubmit={handleSubmit}>
            <div className="login-field">
                <label htmlFor="register-verification-code">Code de vérification</label>
                <input
                    id="register-verification-code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="Saisissez les 6 chiffres"
                    value={code}
                    onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                />
            </div>
            {error && (
                <div className="register-error" role="alert">
                    <span>{error}</span>
                </div>
            )}
            <button className="login-submit" type="submit" disabled={loading || code.length !== 6}>
                <span>{loading ? 'Vérification en cours…' : 'Vérifier et créer mon compte'}</span>
            </button>
            <button className="register-back-button" type="button" onClick={onBack} disabled={loading}>
                Modifier mes informations
            </button>
        </form>
    );
}
