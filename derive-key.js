#!/usr/bin/env node
import { derivePrivateKey } from './dist/index.js'
import { createInterface } from 'readline'

const rl = createInterface({
  input: process.stdin,
  output: process.stdout
})

console.log('='.repeat(70))
console.log('Lockform Passphrase Key Derivation Tool')
console.log('='.repeat(70))
console.log()
console.log('This tool derives a base64-encoded X25519 key from your')
console.log('15-word BIP39 passphrase for use in edge functions.')
console.log()

rl.question('Enter your 15-word passphrase: ', (mnemonic) => {
  try {
    const words = mnemonic.trim().split(/\s+/)

    if (words.length !== 15) {
      console.error('\n❌ Error: Passphrase must be exactly 15 words')
      console.error(`   You entered ${words.length} words`)
      process.exit(1)
    }

    console.log('\n⏳ Deriving encryption key (this may take a few seconds)...\n')

    const privateKeyBase64 = derivePrivateKey(mnemonic.trim())

    console.log('✅ Success! Your base64-encoded encryption key:\n')
    console.log('─'.repeat(70))
    console.log(privateKeyBase64)
    console.log('─'.repeat(70))
    console.log()
    console.log('Add this to your edge function environment variables:')
    console.log()
    console.log(`LOCKFORM_DERIVED_KEY="${privateKeyBase64}"`)
    console.log()
    console.log('⚠️  Keep this secret! Anyone with this key can decrypt all submissions.')
    console.log()

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    process.exit(1)
  } finally {
    rl.close()
  }
})
