import { useState } from "react";
import "./PasswordInput.css";

export default function PasswordInput({
    id,
    name,
    value,
    onChange,
    autoComplete,
    placeholder,
    required = false,
    minLength,
    inputClassName = "",
}) {
    const [visible, setVisible] = useState(false);

    return (
        <div className="password-input-wrap">
            <input
                id={id}
                className={`password-input-field ${inputClassName}`.trim()}
                name={name}
                type={visible ? "text" : "password"}
                autoComplete={autoComplete}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                required={required}
                minLength={minLength}
            />
            <button
                className="password-input-toggle"
                type="button"
                aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={visible}
                onClick={() => setVisible((current) => !current)}
            >
                {visible ? "Masquer" : "Afficher"}
            </button>
        </div>
    );
}
