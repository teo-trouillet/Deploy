# Messagerie Deploy avec Stalwart

Deploy conserve son interface statique, mais les fonctions Mails exigent le backend Node.js et une instance Stalwart joignable depuis ce backend. GitHub Pages seul ne peut pas recevoir du SMTP/IMAP.

## Architecture et prérequis

- Un VPS avec IP publique fixe, accès administrateur, ports SMTP 25/465/587 et IMAP 143/993 ouverts, reverse DNS (PTR) cohérent et nom DNS stable.
- Un domaine de messagerie dont vous contrôlez le DNS.
- Docker Compose (exemple `docker-compose.stalwart.yml`) et TLS valide.
- Node.js 20+ pour Deploy, HTTPS public devant le backend et une `SESSION_SECRET` persistante.
- Ne publiez pas l'interface d'administration Stalwart (8080) sur Internet sans filtrage IP/VPN.

## Démarrage

1. Lancez Stalwart sur un serveur dédié : `docker compose -f docker-compose.stalwart.yml up -d`.
2. Configurez le compte administrateur, le certificat TLS et les domaines depuis l'interface Stalwart.
3. Définissez dans l'environnement du backend Deploy :
   - `STALWART_URL=https://mail.exemple.fr` (URL de base sans slash final)
   - `STALWART_ADMIN_TOKEN` : jeton d'API administrateur Stalwart
   - `STALWART_JMAP_TOKEN` : jeton d'accès JMAP dédié à la messagerie, avec les droits minimum requis
   - `STALWART_JMAP_ACCOUNT_ID` : identifiant de compte JMAP par défaut\n   - `STALWART_FROM_ADDRESS` : adresse expéditeur autorisée par le compte JMAP
4. Configurez `BASE_URL`, `SESSION_SECRET` et OAuth GitHub selon le README existant. Les routes mail requièrent une session Deploy authentifiée.
5. Redémarrez Deploy, vérifiez `GET /api/mail/status`, puis testez l'envoi vers une adresse externe et la réception depuis l'extérieur.

## DNS du domaine

Les valeurs exactes doivent être générées/confirmées par votre instance et votre fournisseur. Exemple à adapter :
- `MX @ 10 mail.exemple.fr.`
- `A mail <IP_PUBLIQUE_DU_VPS>` (ou AAAA si IPv6 opérationnelle)
- `TXT @ "v=spf1 mx -all"` si ce serveur est le seul expéditeur autorisé
- `TXT selector._domainkey` : clé DKIM publiée par Stalwart (ne pas inventer la valeur)
- `TXT _dmarc "v=DMARC1; p=none; rua=mailto:dmarc@exemple.fr"`, puis renforcer la politique après observation
- PTR de l'IP vers `mail.exemple.fr`, cohérence EHLO et TLS
Ne publiez pas de SPF multiple : fusionnez les mécanismes dans un seul enregistrement.

## Sécurité et limites

- Ne mettez jamais les jetons Stalwart dans le JavaScript, Git ou un fichier statique. Utilisez des secrets d'environnement du gestionnaire de déploiement.
- Restreignez l'accès au dashboard aux administrateurs de confiance. Avant un usage multi-utilisateur, associez chaque session Deploy à un principal Stalwart dédié et imposez une autorisation par boîte.
- L'envoi/réception Internet dépend aussi de la réputation IP, du PTR, des règles anti-abus, du TLS, du DNS et des politiques des destinataires.
- Deploy utilise le JMAP Mail standard pour les messages et l’API de gestion JMAP `urn:stalwart:jmap` pour les comptes/domaines (les anciennes API REST d’administration ne sont plus disponibles sur certaines versions récentes). Accordez uniquement les permissions JMAP nécessaires à la clé dédiée et validez les permissions de `x:Account/*`, `x:Domain/*`, `Email/*` et `EmailSubmission/*` avec la version déployée avant production.
