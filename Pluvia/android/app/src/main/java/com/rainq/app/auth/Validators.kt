package com.rainq.app.auth

import android.util.Patterns

/** Each function returns an error message, or null when the input is valid. */
object Validators {

    fun fullName(v: String): String? = when {
        v.isBlank() -> "Full name is required"
        v.trim().length < 2 -> "Name is too short"
        !v.trim().matches(Regex("^[\\p{L} .'-]+$")) -> "Letters and spaces only"
        else -> null
    }

    fun email(v: String): String? = when {
        v.isBlank() -> "Email is required"
        !Patterns.EMAIL_ADDRESS.matcher(v.trim()).matches() -> "Enter a valid email address"
        else -> null
    }

    // PH mobile: 09XXXXXXXXX or +639XXXXXXXXX
    fun phone(v: String): String? = when {
        v.isBlank() -> "Mobile number is required"
        !v.trim().matches(Regex("^(09|\\+639)\\d{9}$")) -> "Use 09XXXXXXXXX or +639XXXXXXXXX"
        else -> null
    }

    fun password(v: String): String? = when {
        v.isEmpty() -> "Password is required"
        v.length < 8 -> "At least 8 characters"
        !v.any { it.isUpperCase() } -> "Add an uppercase letter"
        !v.any { it.isLowerCase() } -> "Add a lowercase letter"
        !v.any { it.isDigit() } -> "Add a number"
        else -> null
    }

    fun confirmPassword(password: String, confirm: String): String? = when {
        confirm.isEmpty() -> "Confirm your password"
        password != confirm -> "Passwords do not match"
        else -> null
    }
}
