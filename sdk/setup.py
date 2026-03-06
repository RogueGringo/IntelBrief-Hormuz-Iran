from setuptools import setup

setup(
    name="sovereign-motion-sdk",
    version="1.0.0",
    description="Python SDK for the Sovereign Motion Intelligence API",
    py_modules=["sovereign_client"],
    install_requires=["requests>=2.28"],
    python_requires=">=3.9",
    author="Sovereign Motion",
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
    ],
)
