package com.rainq.app.auth

import com.google.firebase.FirebaseNetworkException
import com.google.firebase.FirebaseTooManyRequestsException
import com.google.firebase.auth.FirebaseAuthInvalidCredentialsException
import com.google.firebase.auth.FirebaseAuthInvalidUserException

/** True when the problem is the email/password itself (not the network etc.). */
internal fun Exception?.isBadCredentials(): Boolean =
    this is FirebaseAuthInvalidCredentialsException || this is FirebaseAuthInvalidUserException

/** Turns a Firebase Auth exception into a short message for the user. */
internal fun Exception?.toFriendlyMessage(): String = when (this) {
    is FirebaseNetworkException -> "No internet connection. Please try again."
    is FirebaseTooManyRequestsException -> "Too many attempts. Please wait a moment and try again."
    is FirebaseAuthInvalidCredentialsException,
    is FirebaseAuthInvalidUserException -> "Incorrect email or password"
    else -> this?.localizedMessage ?: "Something went wrong. Please try again."
}
