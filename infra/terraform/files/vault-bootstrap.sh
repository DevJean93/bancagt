#!/bin/sh
# Configuración idempotente de Vault para BancaGT.
# Se puede ejecutar N veces: solo crea lo que falta.
set -eu
export VAULT_ADDR="${VAULT_ADDR:-http://vault.vault.svc:8200}"

echo "Esperando a Vault en $VAULT_ADDR ..."
i=0
until vault status >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -gt 60 ] && { echo "Vault no responde"; exit 1; }
  sleep 2
done

# 1. Auditoría: cada acceso a un secreto queda registrado (PCI-DSS 10.2).
#    Se escribe a stdout y Alloy lo envía a Loki.
vault audit list 2>/dev/null | grep -q '^stdout/' || vault audit enable -path=stdout file file_path=stdout

# 2. Motor KV versión 2 (guarda historial de versiones de cada secreto).
vault secrets list | grep -q '^secret/' || vault secrets enable -path=secret kv-v2

# 3. Autenticación con cuentas de servicio de Kubernetes (sin tokens fijos).
vault auth list | grep -q '^kubernetes/' || vault auth enable kubernetes
vault write auth/kubernetes/config kubernetes_host=https://kubernetes.default.svc >/dev/null

# 4. Mínimo privilegio: el namespace banca-prod solo LEE sus propios secretos.
vault policy write banca-lectura - <<'EOF'
path "secret/data/banca/*" {
  capabilities = ["read"]
}
path "secret/metadata/banca/*" {
  capabilities = ["read", "list"]
}
EOF

vault write auth/kubernetes/role/banca \
  bound_service_account_names=eso-banca \
  bound_service_account_namespaces=banca-prod \
  audience=vault \
  policies=banca-lectura \
  ttl=15m >/dev/null

# 5. Secretos iniciales (solo si no existen: no se pisa una rotación previa).
vault kv get secret/banca/db >/dev/null 2>&1 || \
  vault kv put secret/banca/db username=banca password="$SEED_DB_PASSWORD" >/dev/null
vault kv get secret/banca/s3 >/dev/null 2>&1 || \
  vault kv put secret/banca/s3 ACCESS_KEY_ID=bancagt ACCESS_SECRET_KEY="$SEED_S3_SECRET" >/dev/null
vault kv get secret/banca/jwt >/dev/null 2>&1 || \
  vault kv put secret/banca/jwt privada="$SEED_JWT_PRIVADA" publica="$SEED_JWT_PUBLICA" >/dev/null

echo "Vault configurado correctamente"
