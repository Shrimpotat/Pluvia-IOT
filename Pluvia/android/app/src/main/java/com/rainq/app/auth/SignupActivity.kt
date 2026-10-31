package com.rainq.app.auth

import android.content.Intent
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import androidx.core.widget.doOnTextChanged
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputLayout
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.FirebaseAuthUserCollisionException
import com.google.firebase.auth.FirebaseAuthWeakPasswordException
import com.google.firebase.database.FirebaseDatabase
import com.rainq.app.databinding.ActivitySignupBinding

class SignupActivity : AppCompatActivity() {

    private lateinit var b: ActivitySignupBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        b = ActivitySignupBinding.inflate(layoutInflater)
        setContentView(b.root)

        listOf(b.tilName, b.tilEmail, b.tilPhone, b.tilPassword, b.tilConfirm)
            .forEach { it.clearErrorOnType() }

        b.btnSignup.setOnClickListener { submit() }
        b.tvGoLogin.setOnClickListener { finish() }
    }

    private fun submit() {
        val name = b.etName.text.toString().trim()
        val email = b.etEmail.text.toString().trim()
        val phone = b.etPhone.text.toString().trim()
        val password = b.etPassword.text.toString()
        val confirm = b.etConfirm.text.toString()

        val results = listOf(
            b.tilName to Validators.fullName(name),
            b.tilEmail to Validators.email(email),
            b.tilPhone to Validators.phone(phone),
            b.tilPassword to Validators.password(password),
            b.tilConfirm to Validators.confirmPassword(password, confirm)
        )
        results.forEach { (til, error) -> til.error = error }

        results.firstOrNull { it.second != null }?.let {
            it.first.editText?.requestFocus()
            return
        }

        setLoading(true)
        FirebaseAuth.getInstance().createUserWithEmailAndPassword(email, password)
            .addOnCompleteListener(this) { task ->
                if (task.isSuccessful) {
                    saveProfileThenContinue(name, email, phone)
                } else {
                    setLoading(false)
                    when (val e = task.exception) {
                        is FirebaseAuthUserCollisionException -> {
                            b.tilEmail.error = "This email is already registered"
                            b.etEmail.requestFocus()
                        }
                        is FirebaseAuthWeakPasswordException -> b.tilPassword.error = "Choose a stronger password"
                        else -> Snackbar.make(b.root, e.toFriendlyMessage(), Snackbar.LENGTH_LONG).show()
                    }
                }
            }
    }

    /** Saves the profile, signs out the newly created account, and returns to login. */
    private fun saveProfileThenContinue(name: String, email: String, phone: String) {
        val uid = FirebaseAuth.getInstance().currentUser?.uid
        if (uid == null) {
            goToLogin()
            return
        }
        val profile = mapOf("name" to name, "email" to email, "phone" to phone)
        FirebaseDatabase.getInstance().getReference("users").child(uid).setValue(profile)
            .addOnCompleteListener {
                FirebaseAuth.getInstance().signOut()
                goToLogin()
            }
    }

    private fun setLoading(loading: Boolean) {
        b.btnSignup.isEnabled = !loading
        b.btnSignup.text = if (loading) "Creating account..." else "Sign up"
    }

    private fun goToLogin() {
        startActivity(
            Intent(this, LoginActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        )
        finish()
    }
}

internal fun TextInputLayout.clearErrorOnType() {
    editText?.doOnTextChanged { _, _, _, _ -> error = null }
}
