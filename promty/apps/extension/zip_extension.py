import os
import zipfile

def zip_extension():
    # Paths are relative to the extension folder
    dist_dir = 'dist'
    zip_path = os.path.join('..', 'landing', 'public', 'promty-extension.zip')

    # Ensure output directory for zip exists (landing/public)
    os.makedirs(os.path.dirname(zip_path), exist_ok=True)

    # Remove existing zip if it exists
    if os.path.exists(zip_path):
        os.remove(zip_path)

    print(f"Creating zip at {zip_path} from contents of {dist_dir}...")

    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zip_file:
        for root, dirs, files in os.walk(dist_dir):
            for file in files:
                file_path = os.path.join(root, file)
                # Compute path inside zip (relative to dist_dir)
                arcname = os.path.relpath(file_path, dist_dir)
                zip_file.write(file_path, arcname)
                print(f"  Added: {arcname}")

    print("Extension zipped successfully!")

if __name__ == '__main__':
    zip_extension()
