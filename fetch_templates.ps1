$anon = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhdmZzZ2JyZnB2b2xza3Njb2xmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgzODcyNDAsImV4cCI6MjA5Mzk2MzI0MH0.DNNQJ8sHPWljEpYuRoyXtCmR6QCkKmAzfyd08C6kovI"

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$headers = @{ "apikey" = $anon; "Authorization" = "Bearer $anon" }

# Check products table for image_urls
$r = Invoke-WebRequest -Uri "https://vavfsgbrfpvolskscolf.supabase.co/rest/v1/products?select=name,image_url&limit=10&image_url=not.is.null" -Headers $headers -UseBasicParsing -TimeoutSec 30
$data = $r.Content | ConvertFrom-Json
Write-Host "Products with images: $($data.Count)"
$data | ForEach-Object { Write-Host "  $($_.name): $($_.image_url)" }
