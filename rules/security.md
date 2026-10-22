# Security Rules

## Core Principles

- **No secrets in code, logs, or git**
- **Never scrape or store raw bank passwords**
- **Use aggregator tokens or file imports only**
- **All inputs validated with Zod**
- **All queries parameterized**

## Environment Configuration

### Secrets Management

1. **Environment Variables**
   - Copy `.env.example` to `.env` for local development
   - `.env` file is git-ignored
   - Never commit secrets to repository

2. **Required Variables**
   ```bash
   DATABASE_URL=postgresql://user:pass@localhost:5432/db
   ENCRYPTION_KEY=32-byte-hex-string (for live connections)
   APP_TIMEZONE=UTC
   DEFAULT_CURRENCY=USD
   ```

3. **Validation**
   - All environment variables validated with Zod at startup
   - App refuses to start with missing or malformed configuration
   - Validation errors provide clear guidance

### Credential Storage

1. **Encryption Key**
   - Generated once: `openssl rand -hex 32`
   - Stored in environment variables, not files
   - 32 bytes written as hex
   - Never exposed in logs or code

2. **Provider Credentials**
   - Encrypted with AES-256-GCM before storage
   - Never displayed or logged
   - Key management separate from app code

## Application Security

### Authentication & Session Management

1. **Future Phase 6 Implementation**
   ```
   - Passkey or password + TOTP authentication
   - Session expiration and rotation
   - Secure cookie handling
   - Rate limiting for auth endpoints
   ```

2. **Access Control**
   - All data access through authenticated sessions
   - User-specific data isolation
   - Role-based access (single user → local)

### Input Validation

1. **Zod Schema**
   ```
   - All API inputs validated
   - Database queries parameterized
   - SQL injection prevention
   - XSS protection through proper escaping
   ```

2. **Content Security**
   - Sanitize all user inputs
   - Escape dynamic content in templates
   - Validate file uploads
   - Rate limit API endpoints

## Data Protection

### Backup and Recovery

1. **Database Backups**
   ```bash
   # Create backup
   docker compose exec db pg_dump -U moneytracker moneytracker > backup.sql
   
   # Test restore
   docker compose exec db psql -U moneytracker -d moneytracker -f backup.sql
   ```

2. **Backup Schedule**
   - Daily automated backups
   - Weekly off-site copies
   - Backup verification scripts

### Data Export

1. **Export Formats**
   - CSV: Complete transaction history
   - JSON: Structured data export
   - PDF: Formatted reports

2. **Export Process**
   - Filter by date range
   - Select specific accounts
   - Choose format and encryption
   - Secure download handling

## Container Security

### Docker Security

1. **Base Image**
   - Non-root user execution
   - Read-only filesystem where possible
   - Minimal attack surface

2. **Network Security**
   - Internal database network
   - App binds to localhost by default
   - Reverse proxy for internet exposure

3. **Runtime Security**
   ```bash
   # Secure container setup
   BIND_ADDRESS=0.0.0.0 docker compose up --build
   
   # Network isolation
   docker compose networks create app-db
   ```

## Monitoring and Auditing

### Logging

1. **Security Events**
   - Failed login attempts
   - Suspicious transactions
   - Configuration changes
   - Data access logs

2. **Log Management**
   - Rotate logs regularly
   - Secure log storage
   - Monitor for anomalies

## Incident Response

### Security Checklist

1. **Initial Assessment**
   - Identify scope and impact
   - Document affected systems
   - Preserve evidence

2. **Containment**
   - Isolate affected components
   - Block malicious traffic
   - Update compromised credentials

3. **Recovery**
   - Restore from clean backups
   - Verify system integrity
   - Update security controls

4. **Post-Incident**
   - Analyze root causes
   - Implement preventive measures
   - Update response procedures

### Testing Requirements

- Penetration testing
- Vulnerability scanning
- Access control testing
- Data encryption verification
- Backup/restore testing