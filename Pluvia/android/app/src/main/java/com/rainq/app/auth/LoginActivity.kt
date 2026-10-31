package com.rainq.app.auth

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.snackbar.Snackbar
import com.google.firebase.auth.FirebaseAuth
import com.rainq.app.MainActivity
import com.rainq.app.PluviaConfig
import com.rainq.app.databinding.ActivityLoginBinding

class LoginActivity : AppCompatActivity() {

    private lateinit var b: ActivityLoginBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Already logged in? Go straight to the dashboard.
        if (PluviaConfig.isConfigured && FirebaseAuth.getInstance().currentUser != null) {
            goToDashboard()
            return
        }

        b = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(b.root)

        if (!PluviaConfig.isConfigured) {
            b.btnLogin.isEnabled = false
            b.tvGoSignup.isEnabled = false
            Snackbar.make(
                b.root,
                "Firebase is not set up yet. Paste your Firebase values into PluviaConfig.kt.",
                Snackbar.LENGTH_INDEFINITE
            ).show()
            return
        }

        b.tilEmail.clearErrorOnType()
        b.tilPassword.clearErrorOnType()

        b.btnLogin.setOnClickListener { submit() }
        b.tvGoSignup.setOnClickListener {
            startActivity(Intent(this, SignupActivity::class.java))
        }
    }

    private fun submit() {
        val email = b.etEmail.text.toString().trim()
        val password = b.etPassword.text.toString()

        val emailError = Validators.email(email)
        val passwordError = if (password.isEmpty()) "Password is required" else null
        b.tilEmail.error = emailError
        b.tilPassword.error = passwordError

        if (emailError != null) { b.etEmail.requestFocus(); return }
        if (passwordError != null) { b.etPassword.requestFocus(); return }

        setLoading(true)
        FirebaseAuth.getInstance().signInWithEmailAndPassword(email, password)
            .addOnCompleteListener(this) { task ->
                setLoading(false)
                if (task.isSuccessful) {
                    goToDashboard()
                } else if (task.exception.isBadCredentials()) {
                    b.tilPassword.error = task.exception.toFriendlyMessage()
                } else {
                    Snackbar.make(b.root, task.exception.toFriendlyMessage(), Snackbar.LENGTH_LONG).show()
                }
            }
    }

    private fun setLoading(loading: Boolean) {
        b.btnLogin.isEnabled = !loading
        b.btnLogin.text = if (loading) "Logging in..." else "Log in"
    }

    private fun goToDashboard() {
        startActivity(
            Intent(this, MainActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        )
        finish()
    }
}
