#!/bin/sh
# SUMENEP · Pemeriksaan server Hostinger lewat SSH (Tahap D).
#
#   sh hostinger-check.sh sumenep.matamaduranews.com
#
# Yang dilakukan:
#   - MEMBACA: user, lokasi alat (node, mysqldump, tar, ...), versi Node.js,
#     isi folder Web App SUMENEP (~/domains/<subdomain SUMENEP>, hbuilds/current),
#     kapasitas disk akun (df/quota, tanpa menelusuri folder), proses Node milik
#     user ini.
#   - MENULIS hanya di ~/sumenep-data (di luar folder aplikasi dan public_html):
#     membuat ~/sumenep-data/media dan ~/sumenep-data/backups bila belum ada,
#     uji tulis-baca-hapus satu berkas sementara buatannya sendiri, dan satu
#     berkas penanda persistensi (~/sumenep-data/media/.persistensi-penanda) yang
#     tidak pernah ditimpa. Jalankan lagi sesudah redeploy: penanda yang sama =
#     folder terbukti bertahan.
#   - TIDAK menyentuh database, WordPress, folder domain lain, public_html,
#     hbuilds, atau DNS. Tidak membaca atau mencetak password.
#   - Menolak domain selain subdomain SUMENEP dan folder data yang berupa symlink.
set -u
DOMAIN="${1:-sumenep.matamaduranews.com}"
case "$DOMAIN" in
  sumenep.*) ;;
  *) echo "GAGAL: '$DOMAIN' bukan subdomain SUMENEP; dihentikan tanpa perubahan apa pun."; exit 2 ;;
esac
case "$DOMAIN" in
  */*|*..*|*[!a-zA-Z0-9.-]*) echo "GAGAL: nama domain tidak valid; dihentikan tanpa perubahan apa pun."; exit 2 ;;
esac
DATA="$HOME/sumenep-data"
MEDIA="$DATA/media"
BACKUPS="$DATA/backups"
APPDIR="$HOME/domains/$DOMAIN"

line() { printf '\n== %s\n' "$1"; }

line "Akun"
echo "user: $(id -un)  uid: $(id -u)  home: $HOME"

line "Alat"
for tool in node npm git tar gzip sha256sum mariadb-dump mysqldump mariadb mysql; do
  path=$(command -v "$tool" 2>/dev/null || true)
  if [ -z "$path" ]; then
    echo "$tool: (tidak ada)"
  elif [ "$tool" = node ]; then
    echo "$tool: $path ($(node -v 2>/dev/null))"
  else
    echo "$tool: $path"
  fi
done

line "Folder Web App SUMENEP ($APPDIR)"
if [ -d "$APPDIR" ]; then
  ls -la "$APPDIR"
  if [ -L "$APPDIR/hbuilds/current" ]; then
    echo "build aktif: $(readlink "$APPDIR/hbuilds/current")"
  else
    echo "hbuilds/current tidak ditemukan (Web App lama memakai $APPDIR/nodejs?)"
  fi
else
  echo "folder tidak ditemukan; folder SUMENEP lain di ~/domains:"
  ls -d "$HOME"/domains/sumenep* 2>/dev/null || echo "(tidak ada)"
fi

line "Proses Node milik user ini"
ps -o user=,pid=,etime=,args= -u "$(id -un)" 2>/dev/null | grep -E "node|next" | grep -v grep | cut -c1-160 || echo "(tidak terlihat)"

line "Kapasitas disk"
df -h "$HOME" 2>/dev/null
(quota -s 2>/dev/null || true)

line "Folder data SUMENEP ($DATA)"
for d in "$DATA" "$MEDIA" "$BACKUPS"; do
  if [ -L "$d" ]; then
    echo "GAGAL: $d adalah symlink; dihentikan tanpa perubahan."
    exit 2
  fi
done
mkdir -p "$MEDIA" "$BACKUPS" && chmod 750 "$DATA" "$MEDIA" "$BACKUPS"
ls -ld "$DATA" "$MEDIA" "$BACKUPS"
du -sh "$DATA" 2>/dev/null
case "$MEDIA" in
  "$APPDIR"/hbuilds*|"$APPDIR"/public_html*) echo "PERINGATAN: folder media berada di folder yang ditimpa deployment!";;
  *) echo "OK: di luar hbuilds/ dan public_html (tidak ditimpa deployment menurut dokumentasi Hostinger)";;
esac
if [ -d "$BACKUPS" ] && [ -w "$BACKUPS" ]; then
  echo "OK: folder backup siap: $BACKUPS"
else
  echo "GAGAL: folder backup tidak bisa ditulis: $BACKUPS"
fi

line "Uji tulis-baca-hapus"
probe="$MEDIA/.uji-tulis-$$"
if printf 'uji %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$probe" && [ -s "$probe" ] && rm "$probe"; then
  echo "OK: user $(id -un) bisa menulis, membaca, dan menghapus di $MEDIA"
else
  echo "GAGAL: tidak bisa menulis di $MEDIA"
fi

line "Penanda persistensi"
marker="$MEDIA/.persistensi-penanda"
build="$(readlink "$APPDIR/hbuilds/current" 2>/dev/null || echo tidak-diketahui)"
if [ -f "$marker" ]; then
  echo "penanda SUDAH ADA (dibuat sebelumnya):"
  cat "$marker"
  echo "build aktif sekarang: $build"
  echo "→ Bila build aktif berbeda dari 'build saat dibuat', folder media TERBUKTI bertahan setelah redeploy."
else
  {
    echo "dibuat: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "build saat dibuat: $build"
    echo "acak: $(od -An -N8 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n')"
  } > "$marker"
  chmod 640 "$marker"
  echo "penanda DIBUAT:"; cat "$marker"
  echo "→ Jalankan skrip ini lagi setelah redeploy berikutnya untuk membuktikan persistensi."
fi
sha256sum "$marker" 2>/dev/null || true

line "Selesai"
echo "Tidak ada password di keluaran ini."
