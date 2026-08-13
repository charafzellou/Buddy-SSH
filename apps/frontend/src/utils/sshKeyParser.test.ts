import { describe, expect, it } from 'vitest'
import { parseSshPrivateKey } from './sshKeyParser'

const unencryptedEd25519 = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCeY037NnCMOuG04ZVbdnMRMnT2pE7diP31sF71nunIiAAAAJjJ2tDqydrQ
6gAAAAtzc2gtZWQyNTUxOQAAACCeY037NnCMOuG04ZVbdnMRMnT2pE7diP31sF71nunIiA
AAAEC4IxC9x+sNwmJcHuxbVBsOt4IU+KZSatwLxwBLt7U/pp5jTfs2cIw64bThlVt2cxEy
dPakTt2I/fWwXvWe6ciIAAAADnRlc3RAYnVkZHktc3NoAQIDBAUGBw==
-----END OPENSSH PRIVATE KEY-----`

const unencryptedRsaPem = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAgbxsOtnedvUi1hy0mZZLNWrzEiNRZLgVXYlhEgksImmPScn+
ISzwPfd145C33ciXLZVknZUfGOvLJwbbXOMn/NVTLl1v6TiBlFgDqpE+VBjvGjr2
1XZZn+fEnK0+l57su9N/oIKp+4erMcgwe4klCc3PuulKgO0cSzEEncO9ArXga0Dc
mLdshhnV7iVo6jrmJ0uHpwESkzdXiiLp545nU5j7CRAVFOCSUzW5V528tfFxnItV
OllI58mgi2KVqVxkK8rh3yeG9bDWygHI0LWFLPjDOWRqecx2wacbfsAxN+3sHFfN
8/mTmG2i4iGmNHVeQ0WLmJ8ZUspOeOr0Jn7R0QIDAQABAoIBACOz6mcBuR6slHMv
ACZ6PWVMcustbANXQ43zthKEErC/sw6f939CwjSTas5+75Kp1qzVPZS+SooNreEm
Gm1EGCeUv2j1jsw0YDimRhAFG42CNR7XVkFlagG/AxUI+j44nraL3EYcX1IYwmyX
RnxgwCAkEwRBml7DofMxYK9YBCZ/6Z27NsC5cRZDj+ZNPBR+BbtlrdnIAONzOD6D
tpmnuCx1GgZppCFtRElhuFua43TcKN+x31YEvWGpOkZSlMVkNMlGoeoMRlD0iqOO
VGrTTQ7OXHd51ofxu8trkIadY9fpXRRhJMN226OkvWBgiHNDtQ+la4jdaaltHsTp
jE33CLcCgYEAtlTbP8Apc2MNNKBIVpAGtefGG208IezHhWf1+WfQxUOscEHpo1ZS
D1hYAC1pfnUQUjfcjL2RC320k1sw4y76XLsE1/BmX2pq5p5DuCzUYgPun0aB11xj
fuPKjR7xSnMLtMe4cFSZTfVWtvuCpm22VUdgqWG++ng2ChqNjO7iV6sCgYEAtidy
VLgExkMKf6bNfPRzejOBzLnGYNsuVxDzkmSjsg58iSNnOBRQBL3RDwOXn4mCdT/I
BvNftwvPSa0enJkZfKgeN73wGMHqeB8uVaobjFoqv29Fl+/ZkyKXjTqkTh68vlXj
xdP09IC6Ho0ihnmwzP5/vXfzHK1jSX/WYnZEUHMCgYAWtHBs+t/uh3oggIkhhmPf
iRIpXivryZF68lw2B5B+0BOMExkmBtzHHmgu9Xi6j5dNtbkYKY8DUE8JPoTS9Yml
vIA4563H2fef6jtiluqHnhe768rFZ7LYHUOe2SiQ7cyaYXh9PHuusotu09kMIoNf
ETlfPlXK2OdZ0L6puyGiawKBgQCGwFPB/If7q2i+2kS1pZkv0564Ns5cpIh5fF7T
84Ntm23hfcFEKTKw70MS2lN2gCF0X4S4L56lKSVlmZ5FtrS2FSCVl/tgNUQhLN/4
G2lZwPJSwBw5tAO+5x46KiGWcQKrw5pGpPBXWEtXgo0B8lAqtjMFlRDSLCqBGwMb
v+X1pQKBgHVshXsfjyclAgErTGZX8dYLf94Gajz1R00FpSULMUvXoZCITJfSXuao
Lk3dPa04CEvGzODMlUz6X9D+A2OnSGHNn+6oYcDUyL59SmZA38qxqH9jdGWiyd4g
SrWQR1nJ5BjfEaODHMvn5PdZ5i9IKaW0yQaMEORf8dgJ3dshjwTP
-----END RSA PRIVATE KEY-----`

const encryptedEd25519 = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAACmFlczI1Ni1jdHIAAAAGYmNyeXB0AAAAGAAAABCY27Hb3K
5f6z2mYL0BlhfxAAAAGAAAAAEAAAAzAAAAC3NzaC1lZDI1NTE5AAAAII0nFjJLxyqyZEhC
D7giQHwNkUZaFgK0fw9XqNiYJx1SAAAAoFxdj/ZGTXxsCwR5/TX/jujOwzyykjITFMo83C
gmuxZSbsxFz6dhk3iqxi9oL1MHnSt+lmbE6blFqJpmrUGxfjXcm2PyZL1NIjoKE+iAyj1e
hRuyAatSR7Bz+5m95UlpYUmfkvGiCTn3RU0aIa2GJJrW8IQ54YGK7yDqqaesCf2AKCIBVU
GQwY1Qp6gdlLuWiYz0g/qtwfmlTly6ObmQ4E8=
-----END OPENSSH PRIVATE KEY-----`

const encryptedRsaPem = `-----BEGIN RSA PRIVATE KEY-----
Proc-Type: 4,ENCRYPTED
DEK-Info: AES-128-CBC,EFCB5AC344FB439CB5AFA783EB28B751

e+LaCXyGf6r1YLDldv9UEjciWmTI6mMbhdF3BrLFgkxwqQDQZDawc1WAzTT37uDI
Trzg1WiGjdfs01RBWD9wt2w61Kkityoww1NHqpLDfWNuUZoCbrwFPt3bwwjLJaz0
uz5KNcv1kmSkqHog6Wwn1c89qLVtJFkAoQTOxe5BueFb0BoR5hMCHeHvhr4kuMoM
BR2dJ92sE5mwPIT6N0GBp57eyzATgU1Vpcy5EDomjjI5OM1cBe72X0gBUCAX/ZLu
Qqq3AysCyDdlim3gjiq0qTMEWZx46ZVingNl4N0m/fO6hQuW1CPf6Ulfr91w7/f2
fYXqs2YpvKI/ZE1BK3oUv8wmM4FKfbO74uisdGE7z5wKTJoL2z7rfz/J1gkfiFg8
7Yim6l6gFq0Xd9jz0Axv9sAMz7F7dg99pDFdqxPdgflEfO46FNsqyE8MF4djLwio
RjTgeR1+3Y/iajvEQzcj9A5ODO7wZnyzpPEV/QtzZRgACDVVYMBv25TTh4/LtAD9
R0jE1bKpVyk7ZdSSIo2tk6WfoDLSjnZlBV0ACVlJzchgn+wABtwesC1gnt11sEu5
5j+4FU2MispWIHY0tbsugp6FLRV8W3MIVMOsZuO5uo42W2d68FJBAJJsh6iYn4Pi
hJj+BSl6jWE4ktG2kSpjK9tHpW0hOAQET6dsrzF61kzbxhXg9E8vdbXlbTxsSekd
BvZKTFzujYvWICq6CeezC7Yrpfp7t7Pyt7mYmvp9SA8DngELM2Kq643S7pM4pze+
m8jT3mmNtBq2lbC1MdfnqRpccpAdxBuVpV9nmoMRB63j3q+XTWelUbs/DP+7GE/X
ad3DWjuxieCeaYYccTy3j+V9B/5d2yq98NhOUvFuaawfNQORZzJ25mR8cSV5BhNx
LzOxJurRathBfrwqws27lVZMzWZ5qOi6GvXPobTP8G8Tu3U+hhbaopPDU/6zpG6w
gyKB5OhdlkUA1Bj+6bT4ZBcZAr/L5O7kDUqvqx9SzIn9hPClgiF0WsTVyLv6edRw
plU2xAjYoPQ5HsEtcjpZpWJpHst1U5JhlsLjm7nt0rR+DtJckAUoKem6dbOQjBOZ
dbEo/ji24oQJSQ3rrnoTen7gFpoqqSAJTU+Eou4X2UJ47Lt83H6uVNybaowq9lzY
oexNvC2fmaRv44vf3iVUxsjrlEAavvTkRLtVap9qiVCXiYV0zkTpzfjJtA/9Gv9T
koYlIdz/tPOqkNEqnYhL+Ze7kopKlNfjxvlRaUUVBUCu9aKyR1TLOKBCIdtjOHmh
XYheoj15o0zi9YqWyOxy5mTuOZEeEphb/kb2k8LQw/3rktkcGQr05doNrGONfIrj
gCyMApi8Frt34LHwLg9ReBqQTQmrOb3RurUdIm+g7FGwgM+BsYzOWrQzaBD+9Gtm
a8PwGZreO/EgBYlcQXW9IrL0SFAOXwF1iHhB2fMgng7SJbbybO48zrs520LmOOpH
9SAvgAJBtSM+OBZVejyueR8GHsEjA204db50B6I6C2h6CcyMrRUoCn+xPcARuS6s
kpoz+YZglaLD0t9ZVmMbOtUW5E8TbVByT37EjCVAoHkUc+S3heAe6GYMT+hqb497
-----END RSA PRIVATE KEY-----`

describe('parseSshPrivateKey', () => {
	it('parses an unencrypted OpenSSH ed25519 key', () => {
		const result = parseSshPrivateKey(unencryptedEd25519)

		expect(result).toEqual({ status: 'ok', info: { type: 'ed25519', comment: '' } })
	})

	it('parses an unencrypted PEM RSA key', () => {
		const result = parseSshPrivateKey(unencryptedRsaPem)

		expect(result).toEqual({ status: 'ok', info: { type: 'rsa', comment: '' } })
	})

	it('reports an OpenSSH key as encrypted (type still readable from the cleartext pubkey section)', () => {
		const result = parseSshPrivateKey(encryptedEd25519)

		expect(result).toEqual({ status: 'encrypted', info: { type: 'ed25519' } })
	})

	it('reports an encrypted PEM RSA key as encrypted when no passphrase is given', () => {
		const result = parseSshPrivateKey(encryptedRsaPem)

		expect(result).toEqual({ status: 'encrypted', info: { type: 'rsa' } })
	})

	it('accepts an encrypted PEM RSA key given the correct passphrase', () => {
		const result = parseSshPrivateKey(encryptedRsaPem, 'rsapass')

		expect(result).toEqual({ status: 'ok', info: { type: 'rsa', comment: '' } })
	})

	it('rejects an encrypted PEM RSA key given the wrong passphrase', () => {
		const result = parseSshPrivateKey(encryptedRsaPem, 'wrong-passphrase')

		expect(result.status).toBe('invalid')
	})

	it('rejects an invalid/garbage key', () => {
		const result = parseSshPrivateKey('not a real key')

		expect(result.status).toBe('invalid')
	})

	it('rejects an empty key', () => {
		const result = parseSshPrivateKey('   ')

		expect(result).toEqual({ status: 'invalid', message: 'Key is empty' })
	})

	it('rejects a truncated/malformed OpenSSH key', () => {
		const result = parseSshPrivateKey(
			'-----BEGIN OPENSSH PRIVATE KEY-----\nYWJjZGVmZ2g=\n-----END OPENSSH PRIVATE KEY-----',
		)

		expect(result.status).toBe('invalid')
	})
})
