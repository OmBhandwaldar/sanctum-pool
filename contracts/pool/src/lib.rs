#![no_std]

//! Sanctum shielded pool.
//!
//! Deposits move a fixed denomination of a token into the pool and record a
//! Poseidon commitment. Withdrawals spend a commitment by presenting a Groth16
//! (BN254) proof — verified by the `verifier` contract — that the note is a
//! member of a known state-tree root and reveals a fresh nullifier hash. Funds
//! then move to a recipient, unlinkable to the original deposit.
//!
//! State-tree root maintenance: the root is derived deterministically from the
//! on-chain commitment list and posted by an admin ("sequencer") via
//! `update_root`. This is a disclosed simplification; anyone can re-derive the
//! root from the public commitments and check it. Computing the root on-chain
//! with the native Poseidon host function is future work.

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, symbol_short, token, vec, Address, Bytes,
    Env, IntoVal, Symbol, Vec, U256,
};

const RECENT_ROOTS: u32 = 30;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum PoolError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    UnknownRoot = 3,
    NullifierAlreadySpent = 4,
    InvalidProof = 5,
    WrongAmount = 6,
    WrongScope = 7,
    UnknownAspRoot = 8,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Config,
    Commitments,
    Roots,
    AspRoots,
    Nullifier(U256),
}

#[contracttype]
#[derive(Clone)]
pub struct Config {
    pub verifier: Address,
    pub token: Address,
    pub admin: Address,
    pub denom_amount: i128, // token amount per note (transfer units)
    pub denom_field: U256,  // same value as a field element (public input)
    pub scope: U256,        // pool/asset domain separator (public input)
}

fn get_config(env: &Env) -> Result<Config, PoolError> {
    env.storage()
        .instance()
        .get(&DataKey::Config)
        .ok_or(PoolError::NotInitialized)
}

// Serialize public signals into the verifier's byte layout:
// be_u32(len) || be32(sig0) || be32(sig1) || ...
fn encode_public(env: &Env, signals: &[U256]) -> Bytes {
    let mut out = Bytes::new(env);
    out.extend_from_array(&(signals.len() as u32).to_be_bytes());
    for s in signals {
        out.append(&s.to_be_bytes());
    }
    out
}

#[contract]
pub struct SanctumPool;

#[contractimpl]
impl SanctumPool {
    pub fn init(
        env: Env,
        verifier: Address,
        token: Address,
        admin: Address,
        denom_amount: i128,
        denom_field: U256,
        scope: U256,
    ) -> Result<(), PoolError> {
        if env.storage().instance().has(&DataKey::Config) {
            return Err(PoolError::AlreadyInitialized);
        }
        let cfg = Config {
            verifier,
            token,
            admin,
            denom_amount,
            denom_field,
            scope,
        };
        env.storage().instance().set(&DataKey::Config, &cfg);
        env.storage()
            .instance()
            .set(&DataKey::Commitments, &Vec::<U256>::new(&env));
        env.storage()
            .instance()
            .set(&DataKey::Roots, &Vec::<U256>::new(&env));
        env.storage()
            .instance()
            .set(&DataKey::AspRoots, &Vec::<U256>::new(&env));
        Ok(())
    }

    /// Deposit one denomination and record `commitment`. Returns the leaf index.
    pub fn deposit(env: Env, from: Address, commitment: U256) -> Result<u32, PoolError> {
        from.require_auth();
        let cfg = get_config(&env)?;

        let tok = token::Client::new(&env, &cfg.token);
        tok.transfer(&from, &env.current_contract_address(), &cfg.denom_amount);

        let mut commitments: Vec<U256> = env
            .storage()
            .instance()
            .get(&DataKey::Commitments)
            .unwrap_or(Vec::new(&env));
        let index = commitments.len();
        commitments.push_back(commitment.clone());
        env.storage()
            .instance()
            .set(&DataKey::Commitments, &commitments);

        env.events()
            .publish((symbol_short!("deposit"), index), commitment);
        Ok(index)
    }

    /// Admin posts a state-tree root derived from the committed leaves.
    pub fn update_root(env: Env, root: U256) -> Result<(), PoolError> {
        let cfg = get_config(&env)?;
        cfg.admin.require_auth();

        let mut roots: Vec<U256> = env
            .storage()
            .instance()
            .get(&DataKey::Roots)
            .unwrap_or(Vec::new(&env));
        roots.push_back(root.clone());
        while roots.len() > RECENT_ROOTS {
            roots.remove(0);
        }
        env.storage().instance().set(&DataKey::Roots, &roots);
        env.events().publish((symbol_short!("root"),), root);
        Ok(())
    }

    pub fn is_known_root(env: Env, root: U256) -> bool {
        let roots: Vec<U256> = env
            .storage()
            .instance()
            .get(&DataKey::Roots)
            .unwrap_or(Vec::new(&env));
        roots.iter().any(|r| r == root)
    }

    /// Admin (ASP authority) posts the approved-association-set root.
    pub fn update_asp_root(env: Env, asp_root: U256) -> Result<(), PoolError> {
        let cfg = get_config(&env)?;
        cfg.admin.require_auth();

        let mut roots: Vec<U256> = env
            .storage()
            .instance()
            .get(&DataKey::AspRoots)
            .unwrap_or(Vec::new(&env));
        roots.push_back(asp_root.clone());
        while roots.len() > RECENT_ROOTS {
            roots.remove(0);
        }
        env.storage().instance().set(&DataKey::AspRoots, &roots);
        env.events().publish((symbol_short!("asproot"),), asp_root);
        Ok(())
    }

    pub fn is_known_asp_root(env: Env, asp_root: U256) -> bool {
        let roots: Vec<U256> = env
            .storage()
            .instance()
            .get(&DataKey::AspRoots)
            .unwrap_or(Vec::new(&env));
        roots.iter().any(|r| r == asp_root)
    }

    pub fn is_spent(env: Env, nullifier_hash: U256) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Nullifier(nullifier_hash))
    }

    pub fn commitments(env: Env) -> Vec<U256> {
        env.storage()
            .instance()
            .get(&DataKey::Commitments)
            .unwrap_or(Vec::new(&env))
    }

    /// Withdraw one denomination to `recipient` by spending a note.
    ///
    /// Public signals (order fixed by the circuit):
    ///   [nullifier_hash, root, asp_root, recipient_field, amount, scope]
    pub fn withdraw(
        env: Env,
        proof_bytes: Bytes,
        nullifier_hash: U256,
        root: U256,
        asp_root: U256,
        recipient_field: U256,
        recipient: Address,
    ) -> Result<(), PoolError> {
        let cfg = get_config(&env)?;

        // root must be one the admin has posted recently
        if !Self::is_known_root(env.clone(), root.clone()) {
            return Err(PoolError::UnknownRoot);
        }
        // ASP-approved association-set root must be known too
        if !Self::is_known_asp_root(env.clone(), asp_root.clone()) {
            return Err(PoolError::UnknownAspRoot);
        }
        // nullifier must be unspent
        if env
            .storage()
            .persistent()
            .has(&DataKey::Nullifier(nullifier_hash.clone()))
        {
            return Err(PoolError::NullifierAlreadySpent);
        }

        // reconstruct public signals and verify the Groth16 proof
        let signals = [
            nullifier_hash.clone(),
            root,
            asp_root,
            recipient_field,
            cfg.denom_field.clone(),
            cfg.scope.clone(),
        ];
        let pub_bytes = encode_public(&env, &signals);
        let ok: bool = env.invoke_contract(
            &cfg.verifier,
            &Symbol::new(&env, "verify"),
            vec![&env, proof_bytes.into_val(&env), pub_bytes.into_val(&env)],
        );
        if !ok {
            return Err(PoolError::InvalidProof);
        }

        // mark nullifier spent and pay out
        env.storage()
            .persistent()
            .set(&DataKey::Nullifier(nullifier_hash.clone()), &true);
        let tok = token::Client::new(&env, &cfg.token);
        tok.transfer(&env.current_contract_address(), &recipient, &cfg.denom_amount);

        env.events()
            .publish((symbol_short!("withdraw"),), nullifier_hash);
        Ok(())
    }
}
